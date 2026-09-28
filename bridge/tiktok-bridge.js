'use strict';

/* =========================================================
   Puente TikTok Live -> juego Snake
   Un único servidor local en http://127.0.0.1:8080 (nunca 0.0.0.0):
     /            el juego (game/)            /control   panel de control (bridge/control/)
     /config/...  JSON de configuración       /data/...  catálogo de regalos generado
     /api/status  estado del puente (JSON)    WebSocket en el mismo puerto (roles "game" y "control")
   Fuentes de eventos (adaptadores, el juego no las distingue):
     tiktok     live real de TIKTOK_USER (tiktok-live-connector 2.x)
     mock       eventos sintéticos automáticos (activable desde el panel)
     simulator  eventos manuales del panel o de la terminal
   Configuración en ROOT/.env (ver .env.example). Contrato de eventos en el README.
   Uso: node bridge/tiktok-bridge.js [--mock]
   ========================================================= */

const http = require('http');
const path = require('path');
const readline = require('readline');
const { ROOT_DIR, loadEnv, log } = require('./lib/util');

loadEnv();

const { attachWebSocketServer } = require('./lib/ws-server');
const { createStaticHandler } = require('./lib/static');
const { Discovery } = require('./lib/discovery');
const { StreakTracker } = require('./lib/streaks');
const { TikTokAdapter } = require('./adapters/tiktok');
const { MockAdapter } = require('./adapters/mock');
const { SimulatorAdapter } = require('./adapters/simulator');

const HOST = '127.0.0.1'; // solo este PC: el panel no debe quedar expuesto a la red
const PORT = Number(process.env.BRIDGE_PORT) || 8080;
const TIKTOK_USER = (process.env.TIKTOK_USER || '').replace(/^@/, '').trim();
const SIGN_API_KEY = (process.env.EULER_SIGN_API_KEY || '').trim();
const MODE = process.argv.includes('--mock') ? 'mock' : (process.env.BRIDGE_MODE || 'auto').trim().toLowerCase();
// auto: TikTok si hay TIKTOK_USER; si no, mock. Con TikTok nunca se activa el mock automáticamente.
const USE_TIKTOK = MODE === 'tiktok' || (MODE === 'auto' && !!TIKTOK_USER);

// ---------- Estado (se manda al juego y al panel) ----------
const status = {
  startedAt: Date.now(),
  mode: USE_TIKTOK ? 'tiktok' : 'mock',
  tiktok: {
    enabled: USE_TIKTOK,
    user: TIKTOK_USER || null,
    state: USE_TIKTOK ? 'starting' : 'disabled',
    detail: USE_TIKTOK ? '' : 'sin TIKTOK_USER (modo mock)',
    since: Date.now(),
  },
  mock: { enabled: !USE_TIKTOK, running: false },
  clients: { game: 0, control: 0 },
  events: { total: 0, byType: {} },
  game: null, // último estado que reporta el juego
};

let statusTimer = null;
function broadcastStatus() {
  if (statusTimer) return;
  statusTimer = setTimeout(() => {
    statusTimer = null;
    status.clients.game = ws.count('game');
    status.clients.control = ws.count('control');
    ws.broadcast({ kind: 'status', ...status, now: Date.now() });
  }, 150);
}

// ---------- Eventos ----------
const discovery = new Discovery();
const streaks = new StreakTracker();

function describeEvent(e) {
  switch (e.type) {
    case 'gift':
      return `${e.user} -> ${e.giftName} (id ${e.giftId ?? '?'}) x${e.repeatCount}${e.streakTotal ? ` [racha ${e.streakTotal}${e.streakEnd ? ', fin' : ''}]` : ''} · ${e.diamondCount} diam.`;
    case 'like':
      return `${e.user} da ${e.likeCount} like(s)`;
    case 'follow':
      return `${e.user} sigue al canal`;
    case 'share':
      return `${e.user} comparte el live`;
    case 'chat':
      return `${e.user}${e.isOwner ? ' (dueño)' : e.isModerator ? ' (mod)' : ''}: ${e.message}`;
    default:
      return JSON.stringify(e);
  }
}

// Punto único por el que pasa todo evento (de cualquier adaptador) camino al juego
function emit(raw) {
  const source = raw.source || 'tiktok';
  let event;
  if (raw.type === 'gift') {
    event = streaks.process(raw);
    if (!event) return; // evento final de una racha ya contada
  } else {
    const { streak, ...rest } = raw;
    event = rest;
  }
  event = { ...event, source, timestamp: event.timestamp || Date.now() };
  status.events.total++;
  status.events.byType[event.type] = (status.events.byType[event.type] || 0) + 1;
  const games = ws.count('game');
  log(`${source}:${event.type}`, describeEvent(event) + (games === 0 ? '   (sin juego conectado: descartado)' : ''));
  ws.broadcast(event, 'game');
  ws.broadcast({ kind: 'event', event }, 'control');
  broadcastStatus();
}

const adapterCtx = {
  emit,
  log,
  discovery,
  setStatus(patch) {
    const changed = patch.state && patch.state !== status.tiktok.state;
    Object.assign(status.tiktok, patch, changed ? { since: Date.now() } : {});
    if (changed) log('tiktok', `estado: ${status.tiktok.state}${status.tiktok.detail ? ` (${status.tiktok.detail})` : ''}`);
    broadcastStatus();
  },
  getStatus: () => status.tiktok,
};

const simulator = new SimulatorAdapter(adapterCtx);
const mock = new MockAdapter(adapterCtx);
const tiktok = USE_TIKTOK ? new TikTokAdapter(adapterCtx, { user: TIKTOK_USER, signApiKey: SIGN_API_KEY }) : null;

// El mock solo corre si está activado y hay algún juego conectado
function syncMock() {
  const shouldRun = status.mock.enabled && ws.count('game') > 0;
  if (shouldRun && !mock.enabled) mock.start();
  if (!shouldRun && mock.enabled) mock.stop();
  status.mock.running = mock.enabled;
  broadcastStatus();
}

// ---------- Servidor HTTP + WebSocket ----------
const serveStatic = createStaticHandler([
  { prefix: '/control', dir: path.join(ROOT_DIR, 'bridge', 'control') },
  { prefix: '/config', dir: path.join(ROOT_DIR, 'config') },
  { prefix: '/data', dir: path.join(ROOT_DIR, 'data') },
  { prefix: '/', dir: path.join(ROOT_DIR, 'game') },
]);

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/status')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ...status, now: Date.now() }));
    return;
  }
  if (!serveStatic(req, res)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No encontrado');
  }
});

const ws = attachWebSocketServer(server, {
  log,
  onConnect(client) {
    client.send({ kind: 'status', ...status, now: Date.now() });
  },
  onMessage(client, msg) {
    switch (msg.kind) {
      case 'hello':
        client.role = msg.role === 'control' ? 'control' : 'game';
        log('ws', `${client.role === 'game' ? 'juego' : 'panel'} conectado (cliente ${client.id})`);
        if (client.role === 'game') syncMock();
        broadcastStatus();
        break;
      case 'gameStatus':
        status.game = { ...msg, at: Date.now() };
        delete status.game.kind;
        ws.broadcast({ kind: 'gameStatus', ...status.game }, 'control');
        break;
      case 'simulate':
        if (client.role === 'control' && msg.event) simulator.inject(msg.event);
        break;
      case 'mock':
        if (client.role !== 'control') break;
        status.mock.enabled = !!msg.enabled;
        syncMock();
        break;
      case 'command':
        // Órdenes del panel para el juego (temática, modo, pausa, volumen...)
        if (client.role !== 'control') break;
        log('panel', `orden al juego: ${msg.command} ${msg.args !== undefined ? JSON.stringify(msg.args) : ''}`);
        ws.broadcast({ kind: 'command', command: msg.command, args: msg.args }, 'game');
        break;
      default:
        break;
    }
  },
  onClose(client) {
    if (client.role !== 'unknown') log('ws', `${client.role === 'game' ? 'juego' : 'panel'} desconectado (cliente ${client.id})`);
    if (client.role === 'game') syncMock();
    broadcastStatus();
  },
});

setInterval(broadcastStatus, 5000).unref();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log('error', `el puerto ${PORT} ya está en uso (¿otro puente abierto?)`);
  else log('error', err.message);
  process.exit(1);
});

// ---------- Eventos a mano desde la terminal ----------
function printHelp() {
  console.log(
    [
      'Comandos (escribe y pulsa Enter):',
      '  chat <usuario> <mensaje...>              ej: chat test1 !team colombia',
      '  gift <usuario> <diamantes> [racha] [id] [nombre]   ej: gift test2 1 5 5655 Rose',
      '  like <usuario> [cantidad]',
      '  follow <usuario> | share <usuario>',
      '  mock on | mock off',
      '  {json}                                   evento crudo, ej: {"type":"chat","user":"x","message":"hola"}',
    ].join('\n')
  );
}

function parseCommand(line) {
  const text = line.trim();
  if (!text) return null;
  if (text.startsWith('{')) return JSON.parse(text);
  const [cmd, user = 'consola', ...rest] = text.split(/\s+/);
  switch (cmd.toLowerCase()) {
    case 'chat':
      return { type: 'chat', user, message: rest.join(' ') };
    case 'gift':
      return {
        type: 'gift',
        user,
        diamondCount: Number(rest[0]) || 1,
        streak: Number(rest[1]) || 1,
        giftId: rest[2] ? Number(rest[2]) : undefined,
        giftName: rest.slice(3).join(' ') || undefined,
      };
    case 'like':
      return { type: 'like', user, likeCount: Number(rest[0]) || 1 };
    case 'follow':
    case 'share':
      return { type: cmd.toLowerCase(), user };
    default:
      return undefined;
  }
}

if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    const text = line.trim();
    if (/^mock (on|off)$/i.test(text)) {
      status.mock.enabled = /on$/i.test(text);
      syncMock();
      return;
    }
    try {
      const event = parseCommand(text);
      if (event === undefined) printHelp();
      else if (event) simulator.inject(event);
    } catch (e) {
      log('error', `comando no válido: ${e.message}`);
    }
  });
}

// ---------- Arranque ----------
server.listen(PORT, HOST, () => {
  log('servidor', `juego:  http://localhost:${PORT}/`);
  log('servidor', `panel:  http://localhost:${PORT}/control`);
  log('servidor', `WebSocket en ws://localhost:${PORT} (solo 127.0.0.1)`);
  if (USE_TIKTOK) {
    log('tiktok', `modo TikTok real: @${TIKTOK_USER}${SIGN_API_KEY ? ' (con API key de firma)' : ' (firma gratuita de Euler Stream)'}`);
    tiktok.start();
  } else {
    log('mock', MODE === 'tiktok' ? 'BRIDGE_MODE=tiktok pero falta TIKTOK_USER: modo mock' : 'modo mock: eventos de prueba cuando el juego se conecte');
  }
  if (process.stdin.isTTY) printHelp();
});

function shutdown() {
  log('servidor', 'cerrando puente');
  if (tiktok) tiktok.stop();
  mock.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

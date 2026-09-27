'use strict';

/* =========================================================
   Puente TikTok Live -> juego Snake
   - Servidor WebSocket local en ws://localhost:8080 (el juego se conecta como cliente).
   - Modo real: escucha el live de TIKTOK_USER con tiktok-live-connector y reenvía cada evento.
   - Modo mock: emite eventos sintéticos cada 3-5 s para probar sin TikTok.
     Se activa si no hay TIKTOK_USER, con --mock, o si tiktok-live-connector no está instalado.
   - Consola: se pueden inyectar eventos a mano escribiendo en la terminal (ver printHelp()).

   Contrato de cada mensaje (JSON) puente -> juego:
     { type: 'gift' | 'like' | 'follow' | 'share' | 'chat', user: string, timestamp: number,
       diamondCount?, giftName?, giftId?, repeatCount?, likeCount?, message? }

   Uso:
     node bridge/tiktok-bridge.js                  (mock)
     TIKTOK_USER=usuario node bridge/tiktok-bridge.js
   ========================================================= */

const http = require('http');
const crypto = require('crypto');
const readline = require('readline');

const PORT = Number(process.env.BRIDGE_PORT) || 8080;
const TIKTOK_USER = (process.env.TIKTOK_USER || '').replace(/^@/, '').trim();
const FORCE_MOCK = process.argv.includes('--mock');
const TIKTOK_RETRY_MS = 15000;
const MOCK_MIN_DELAY_MS = 3000;
const MOCK_MAX_DELAY_MS = 5000;

// ---------- Logs ----------
const time = () => new Date().toTimeString().slice(0, 8);
const log = (tag, ...args) => console.log(`[${time()}] [${tag}]`, ...args);

// Describe un evento en una línea legible para la consola
function describeEvent(e) {
  switch (e.type) {
    case 'gift':
      return `${e.user} envía ${e.giftName || 'regalo'} (id ${e.giftId ?? '?'}) x${e.repeatCount || 1} · ${e.diamondCount ?? 0} diamantes`;
    case 'like':
      return `${e.user} da ${e.likeCount || 1} like(s)`;
    case 'follow':
      return `${e.user} sigue al canal`;
    case 'share':
      return `${e.user} comparte el live`;
    case 'chat':
      return `${e.user}: ${e.message}`;
    default:
      return JSON.stringify(e);
  }
}

// ---------- Servidor WebSocket mínimo (RFC 6455, solo texto) ----------
// Sin dependencias: Node no trae servidor WebSocket y así el mock funciona sin `npm install`.
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// Procesa los frames que manda el navegador (siempre enmascarados). Solo nos importan close y ping.
function handleClientData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const b = client.buffer;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (b.length < 4) return;
      len = b.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (b.length < 10) return;
      len = Number(b.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLen = masked ? 4 : 0;
    if (b.length < offset + maskLen + len) return; // frame incompleto: esperar más datos
    const mask = masked ? b.subarray(offset, offset + 4) : null;
    const payload = Buffer.from(b.subarray(offset + maskLen, offset + maskLen + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    client.buffer = b.subarray(offset + maskLen + len);

    if (opcode === 0x8) {
      // close
      client.socket.end(encodeFrame(0x8, Buffer.alloc(0)));
      return;
    }
    if (opcode === 0x9) client.socket.write(encodeFrame(0xa, payload)); // ping -> pong
    if (opcode === 0x1) log('juego', payload.toString('utf8'));
  }
}

function broadcast(event) {
  const frame = encodeFrame(0x1, Buffer.from(JSON.stringify(event), 'utf8'));
  for (const client of clients) client.socket.write(frame);
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`Puente Snake TikTok. Conecta por WebSocket a ws://localhost:${PORT}\n`);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);
  const client = { socket, buffer: Buffer.alloc(0) };
  clients.add(client);
  log('ws', `juego conectado (${clients.size} cliente/s)`);
  socket.on('data', (chunk) => handleClientData(client, chunk));
  const drop = () => {
    if (!clients.delete(client)) return;
    log('ws', `juego desconectado (${clients.size} cliente/s)`);
    if (clients.size === 0) stopMock();
  };
  socket.on('close', drop);
  socket.on('error', drop);
  onClientConnected();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') log('error', `el puerto ${PORT} ya está en uso (¿otro puente abierto?)`);
  else log('error', err.message);
  process.exit(1);
});

// ---------- Envío de eventos al juego ----------
function emitEvent(event) {
  const full = { ...event, timestamp: event.timestamp || Date.now() };
  log(full.type, describeEvent(full) + (clients.size === 0 ? '   (sin juego conectado: descartado)' : ''));
  if (clients.size > 0) broadcast(full);
}

// ---------- Modo real: TikTok Live ----------
let mode = 'mock';

function startTikTok() {
  let WebcastPushConnection;
  try {
    ({ WebcastPushConnection } = require('tiktok-live-connector'));
  } catch (e) {
    log('tiktok', 'tiktok-live-connector no está instalado (cd bridge && npm install). Arrancando en MODO MOCK.');
    return false;
  }
  mode = 'tiktok';
  const connection = new WebcastPushConnection(TIKTOK_USER);

  const connect = () => {
    log('tiktok', `conectando al live de @${TIKTOK_USER}...`);
    connection
      .connect()
      .then((info) => log('tiktok', `conectado al live de @${TIKTOK_USER} (roomId ${info.roomId})`))
      .catch((err) => {
        // Con un usuario real NO se pasa a mock: meter regalos falsos en un directo sería peor que no tener eventos
        log('tiktok', `no se pudo conectar (${err.message || err}). Reintento en ${TIKTOK_RETRY_MS / 1000} s`);
        setTimeout(connect, TIKTOK_RETRY_MS);
      });
  };

  connection.on('disconnected', () => {
    log('tiktok', `desconectado del live. Reintento en ${TIKTOK_RETRY_MS / 1000} s`);
    setTimeout(connect, TIKTOK_RETRY_MS);
  });
  connection.on('streamEnd', () => log('tiktok', 'el live terminó'));

  connection.on('gift', (data) => {
    // Regalos en racha (giftType 1): TikTok manda un evento por cada repetición; solo reenviamos el final
    if (data.giftType === 1 && !data.repeatEnd) return;
    emitEvent({
      type: 'gift',
      user: data.uniqueId,
      giftId: data.giftId,
      giftName: data.giftName,
      diamondCount: data.diamondCount,
      repeatCount: data.repeatCount || 1,
    });
  });
  connection.on('like', (data) => emitEvent({ type: 'like', user: data.uniqueId, likeCount: data.likeCount }));
  connection.on('follow', (data) => emitEvent({ type: 'follow', user: data.uniqueId }));
  connection.on('share', (data) => emitEvent({ type: 'share', user: data.uniqueId }));
  connection.on('chat', (data) => emitEvent({ type: 'chat', user: data.uniqueId, message: data.comment }));

  connect();
  return true;
}

// ---------- Modo mock ----------
const MOCK_USERS = ['ana_gamer', 'pipe_col', 'lu.arg', 'snakefan99', 'maria_123', 'juanito', 'la_profe', 'dj_tito'];
// La Rosa (5655) es el id real del spec; el resto son ids de ejemplo para probar
const MOCK_GIFTS = [
  { giftId: 5655, giftName: 'Rose', diamondCount: 1 },
  { giftId: 5269, giftName: 'TikTok', diamondCount: 1 },
  { giftId: 5487, giftName: 'Finger Heart', diamondCount: 5 },
  { giftId: 5879, giftName: 'Doughnut', diamondCount: 30 },
  { giftId: 6064, giftName: 'Hand Hearts', diamondCount: 100 },
];
const MOCK_CHAT = ['!team colombia', '!team argentina', 'hola!!', 'vamos verde', 'jajaja', '!team col', 'que buena partida', '!team arg'];
let mockTimer = null;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function randomMockEvent() {
  const user = pick(MOCK_USERS);
  const r = Math.random();
  if (r < 0.35) return { type: 'like', user, likeCount: 1 + Math.floor(Math.random() * 15) };
  if (r < 0.6) return { type: 'chat', user, message: pick(MOCK_CHAT) };
  if (r < 0.8) return { type: 'gift', user, ...pick(MOCK_GIFTS), repeatCount: 1 };
  if (r < 0.9) return { type: 'follow', user };
  return { type: 'share', user };
}

function scheduleMock() {
  const delay = MOCK_MIN_DELAY_MS + Math.random() * (MOCK_MAX_DELAY_MS - MOCK_MIN_DELAY_MS);
  mockTimer = setTimeout(() => {
    emitEvent(randomMockEvent());
    scheduleMock();
  }, delay);
}

function stopMock() {
  if (mockTimer) clearTimeout(mockTimer);
  mockTimer = null;
}

// Al conectarse el juego: en mock, una pequeña secuencia fija (útil para probar) y luego eventos aleatorios
function onClientConnected() {
  if (mode !== 'mock' || mockTimer) return;
  const script = [
    { type: 'chat', user: 'test1', message: '!team colombia' },
    { type: 'gift', user: 'test2', giftId: 5655, giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
    { type: 'chat', user: 'test3', message: '!team argentina' },
  ];
  script.forEach((event, i) => setTimeout(() => emitEvent(event), 800 + i * 700));
  mockTimer = setTimeout(scheduleMock, 800 + script.length * 700);
}

// ---------- Eventos a mano desde la terminal ----------
function printHelp() {
  console.log(
    [
      'Comandos (escribe y pulsa Enter):',
      '  chat <usuario> <mensaje...>        ej: chat test1 !team colombia',
      '  gift <usuario> <diamantes> [id] [nombre]   ej: gift test2 1 5655 Rose',
      '  like <usuario> [cantidad]',
      '  follow <usuario>',
      '  share <usuario>',
      '  {json}                             evento crudo, ej: {"type":"chat","user":"x","message":"hola"}',
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
        giftId: rest[1] ? Number(rest[1]) : undefined,
        giftName: rest.slice(2).join(' ') || 'Regalo',
        repeatCount: 1,
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
    try {
      const event = parseCommand(line);
      if (event === undefined) printHelp();
      else if (event) emitEvent(event);
    } catch (e) {
      log('error', `comando no válido: ${e.message}`);
    }
  });
}

// ---------- Arranque ----------
server.listen(PORT, () => {
  log('ws', `servidor WebSocket en ws://localhost:${PORT}`);
  if (TIKTOK_USER && !FORCE_MOCK && startTikTok()) return;
  mode = 'mock';
  log('mock', TIKTOK_USER ? 'MODO MOCK (forzado o sin librería)' : 'MODO MOCK: no hay TIKTOK_USER, se emitirán eventos de prueba');
  log('mock', 'los eventos empiezan cuando el juego se conecte');
  if (process.stdin.isTTY) printHelp();
});

process.on('SIGINT', () => {
  log('ws', 'cerrando puente');
  process.exit(0);
});

'use strict';

/* Panel de control: se conecta al puente con el rol "control", muestra el estado,
   inyecta eventos en el simulador y manda órdenes al juego. */

const $ = (sel) => document.querySelector(sel);
let socket = null;
let lastStatus = null;
let lastGame = null;

function connect() {
  socket = new WebSocket(`ws://${location.host}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ kind: 'hello', role: 'control' }));
    setPill($('#ws-state'), 'good', 'conectado al puente');
  };
  socket.onclose = () => {
    setPill($('#ws-state'), 'bad', 'sin conexión con el puente');
    setTimeout(connect, 2000);
  };
  socket.onmessage = (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch (e) {
      return;
    }
    if (data.kind === 'status') {
      lastStatus = data;
      renderStatus();
    } else if (data.kind === 'gameStatus') {
      lastGame = data;
      renderStatus();
    } else if (data.kind === 'event') {
      addEvent(data.event);
    }
  };
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}

function simulate(event) {
  send({ kind: 'simulate', event });
}

// Orden al juego (la usa también el panel completo del Bloque 5)
function command(name, args) {
  send({ kind: 'command', command: name, args });
}

function setPill(el, cls, text) {
  el.className = `pill ${cls}`;
  el.textContent = text;
}

const TIKTOK_STATES = {
  connected: 'conectado al LIVE',
  connecting: 'conectando…',
  offline: 'no está en vivo (reintentando)',
  ended: 'el LIVE terminó (esperando el próximo)',
  error: 'error (reintentando)',
  starting: 'arrancando',
  disabled: 'desactivado',
};

function renderStatus() {
  const s = lastStatus;
  if (!s) return;
  const rows = [
    ['Modo', s.mode === 'tiktok' ? `TikTok real (@${s.tiktok.user})` : 'mock / simulador'],
    ['TikTok', `${TIKTOK_STATES[s.tiktok.state] || s.tiktok.state}${s.tiktok.detail ? ` · ${s.tiktok.detail}` : ''}`],
    ['Espectadores', s.tiktok.viewers ?? '—'],
    ['Mock', s.mock.enabled ? (s.mock.running ? 'activo' : 'activado (espera al juego)') : 'apagado'],
    ['Clientes', `${s.clients.game} juego(s) · ${s.clients.control} panel(es)`],
    ['Eventos', `${s.events.total} ${Object.entries(s.events.byType).map(([k, v]) => `${k}:${v}`).join(' ')}`],
  ];
  if (lastGame) {
    const age = Math.round((Date.now() - lastGame.at) / 1000);
    rows.push(['Juego', `${lastGame.fps} fps · ronda ${lastGame.round} (${lastGame.phase}) · ${lastGame.mode} · ${lastGame.theme} · errores ${lastGame.errors} · hace ${age}s`]);
  }
  $('#status').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join('');
  $('#mock-toggle').checked = !!s.mock.enabled;
}

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function addEvent(e) {
  const li = document.createElement('li');
  const time = new Date(e.timestamp || Date.now()).toTimeString().slice(0, 8);
  let text = `${e.type} ${e.user}`;
  if (e.type === 'gift') text += ` → ${e.giftName} x${e.repeatCount} (${e.diamondCount}💎)${e.streakTotal ? ` racha ${e.streakTotal}` : ''}`;
  if (e.type === 'like') text += ` +${e.likeCount}`;
  if (e.type === 'chat') text += `: ${e.message}`;
  li.innerHTML = `<span class="src">${time} [${e.source}]</span> ${escapeHtml(text)}`;
  const list = $('#events');
  list.prepend(li);
  while (list.children.length > 100) list.lastChild.remove();
}

// ---------- Simulador ----------
function simUser() {
  return $('#sim-user').value.trim() || 'simulador';
}

// Si se eligió equipo, el usuario "escribe" su equipo en el chat antes (mismo camino que un espectador real)
function joinTeamIfNeeded() {
  const team = $('#sim-team').value;
  if (team) simulate({ type: 'chat', user: simUser(), message: `!team ${team}` });
}

function sendGift(diamonds, overrides = {}) {
  joinTeamIfNeeded();
  simulate({
    type: 'gift',
    user: simUser(),
    diamondCount: diamonds,
    giftId: overrides.giftId,
    giftName: overrides.giftName || `Regalo ${diamonds}💎`,
    streak: Number($('#gift-streak').value) || 1,
  });
}

document.querySelectorAll('[data-gift]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const d = Number(btn.dataset.gift);
    sendGift(d, d === 1 ? { giftId: 5655, giftName: 'Rose' } : {});
  });
});
$('#send-gift').addEventListener('click', () => {
  sendGift(Number($('#gift-diamonds').value) || 1, {
    giftId: Number($('#gift-id').value) || undefined,
    giftName: $('#gift-name').value.trim() || undefined,
  });
});
document.querySelectorAll('[data-likes]').forEach((btn) => {
  btn.addEventListener('click', () => {
    joinTeamIfNeeded();
    simulate({ type: 'like', user: simUser(), likeCount: Number(btn.dataset.likes) });
  });
});
$('#send-follow').addEventListener('click', () => simulate({ type: 'follow', user: simUser() }));
$('#send-share').addEventListener('click', () => {
  joinTeamIfNeeded();
  simulate({ type: 'share', user: simUser() });
});
$('#send-chat').addEventListener('click', () => {
  const message = $('#chat-msg').value.trim();
  if (message) simulate({ type: 'chat', user: simUser(), message });
});
$('#mock-toggle').addEventListener('change', (e) => send({ kind: 'mock', enabled: e.target.checked }));

connect();

'use strict';

/* Panel de control: se conecta al puente con el rol "control", muestra el estado,
   manda órdenes al juego e inyecta eventos en el simulador. Pensado para un segundo monitor. */

const $ = (sel) => document.querySelector(sel);
let socket = null;
let lastStatus = null;
let lastGame = null;
let catalog = [];

// ---------- Conexión ----------
function connect() {
  socket = new WebSocket(`ws://${location.host}`);
  socket.onopen = () => {
    socket.send(JSON.stringify({ kind: 'hello', role: 'control' }));
    setPill($('#ws-state'), 'good', 'puente conectado');
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
      renderGame();
      renderAudio();
    } else if (data.kind === 'event') {
      addEvent(data.event);
    }
  };
}

function send(obj) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
}

const simulate = (event) => send({ kind: 'simulate', event });
const command = (name, args) => send({ kind: 'command', command: name, args });

function setPill(el, cls, text) {
  el.className = `pill ${cls}`;
  el.textContent = text;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---------- Estado ----------
const TIKTOK_STATES = {
  connected: 'conectado al LIVE',
  connecting: 'conectando…',
  offline: 'no está en vivo (reintentando)',
  ended: 'el LIVE terminó (esperando el próximo)',
  error: 'error (reintentando)',
  starting: 'arrancando',
  disabled: 'desactivado (modo mock)',
};

function renderStatus() {
  const s = lastStatus;
  if (!s) return;
  const t = s.tiktok;
  setPill($('#tiktok-pill'), t.state === 'connected' ? 'good' : 'warn', `TikTok: ${TIKTOK_STATES[t.state] || t.state}`);
  const gameAge = lastGame ? (Date.now() - lastGame.at) / 1000 : Infinity;
  const gameOk = s.clients.game > 0 && gameAge < 6;
  setPill($('#game-pill'), gameOk ? 'good' : 'bad', gameOk ? `juego: ${lastGame.fps} fps` : 'juego: sin conexión');
  const rows = [
    ['Modo del puente', s.mode === 'tiktok' ? `TikTok real (@${t.user})` : 'mock / simulador'],
    ['TikTok', `${TIKTOK_STATES[t.state] || t.state}${t.detail ? ` · ${t.detail}` : ''}${t.nextRetryAt ? ` · reintento en ${Math.max(0, Math.round((t.nextRetryAt - Date.now()) / 1000))} s` : ''}`],
    ['Espectadores', t.viewers ?? '—'],
    ['Clientes', `${s.clients.game} juego(s) · ${s.clients.control} panel(es)`],
    ['Eventos recibidos', `${s.events.total} ${Object.entries(s.events.byType).map(([k, v]) => `${k}:${v}`).join(' ')}`],
    ['Puente activo desde', new Date(s.startedAt).toLocaleString()],
  ];
  if (lastGame) {
    const g = lastGame;
    rows.push(['Juego', `${g.fps} fps · ronda ${g.round} (${g.phase}${g.paused ? ', PAUSA' : ''}) · ${g.mode} · ${g.themes ? g.themes[g.theme] : g.theme}`]);
    rows.push(['Errores del juego', `${g.errors} desde que se abrió (hace ${g.uptimeMin} min)`]);
    if (g.metrics) rows.push(['Cola de efectos', `${g.queue} pendientes · regalos ${g.metrics.gifts} (${g.metrics.units} u.) · efectos ${g.metrics.effects} · a puntos ${g.metrics.overflow}`]);
    if (g.memory !== null && g.memory !== undefined) rows.push(['Memoria del juego', `${g.memory} MB`]);
    rows.push(['Programador', g.schedule ? `${g.schedule.current} · quedan ${g.schedule.minutesLeft} min · luego ${g.schedule.next}` : 'desactivado']);
  }
  $('#status').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
  $('#mock-toggle').checked = !!s.mock.enabled;
}

// ---------- Juego ----------
function renderGame() {
  const g = lastGame;
  const themeSel = $('#theme-select');
  if (g.themes && themeSel.options.length !== Object.keys(g.themes).length) {
    themeSel.innerHTML = Object.entries(g.themes).map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('');
  }
  if (document.activeElement !== themeSel) themeSel.value = g.currentTheme;
  if (document.activeElement !== $('#mode-select')) $('#mode-select').value = g.nextMode;
  $('#pause-btn').textContent = g.paused ? '▶ Reanudar' : '⏸ Pausar';
  $('#schedule-toggle').checked = !!g.schedule;
  // Nombres reales de los equipos en el simulador
  const teamSel = $('#sim-team');
  if (g.teamNames) {
    teamSel.options[1].textContent = g.teamNames.p1;
    teamSel.options[2].textContent = g.teamNames.p2;
  }
  // Bloqueados
  const blocked = g.blockedUsers || [];
  const list = $('#blocked-list');
  const key = blocked.join(',');
  if (list.dataset.key !== key) {
    list.dataset.key = key;
    list.innerHTML = blocked.length ? '' : '<small>ninguno</small>';
    for (const user of blocked) {
      const b = document.createElement('button');
      b.textContent = `${user} ✕`;
      b.title = 'Desbloquear';
      b.addEventListener('click', () => command('unblockUser', user));
      list.appendChild(b);
    }
  }
}

$('#theme-select').addEventListener('change', (e) => command('setTheme', e.target.value));
$('#mode-select').addEventListener('change', (e) => command('setMode', e.target.value));
$('#pause-btn').addEventListener('click', () => command('togglePause'));
$('#skip-btn').addEventListener('click', () => command('skipRound'));
$('#zones-btn').addEventListener('click', () => command('toggleSafeZones'));
$('#reload-mapping').addEventListener('click', () => command('reloadMapping'));
$('#reload-config').addEventListener('click', () => command('reloadConfig'));
$('#schedule-toggle').addEventListener('change', (e) => command('setScheduleEnabled', e.target.checked));
$('#reset-ranking').addEventListener('click', () => confirm('¿Reiniciar el top de donadores de la sesión?') && command('resetRanking'));
$('#reset-scores').addEventListener('click', () => confirm('¿Reiniciar los marcadores de rondas y el récord?') && command('resetScores'));
$('#reload-page').addEventListener('click', () => confirm('¿Recargar la página del juego? (se conservan marcadores y equipos)') && command('reloadPage'));

// ---------- Audio ----------
function renderAudio() {
  const a = lastGame && lastGame.audio;
  if (!a) return;
  const st = a.locked ? 'BLOQUEADO: haz clic en la ventana del juego' : `activo · voz: ${a.voice || 'ninguna'} · kenney: ${a.kenney}`;
  $('#audio-state').textContent = `(${st})`;
  document.querySelectorAll('[data-audio]').forEach((el) => {
    if (el === document.activeElement) return;
    const value = a.settings[el.dataset.audio];
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  });
  const box = $('#sound-buttons');
  if (box.childElementCount !== a.sounds.length) {
    box.innerHTML = '';
    for (const name of a.sounds) {
      const b = document.createElement('button');
      b.textContent = name;
      b.addEventListener('click', () => command('testSound', name));
      box.appendChild(b);
    }
  }
}

document.querySelectorAll('[data-audio]').forEach((el) => {
  el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
    const key = el.dataset.audio;
    let value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (key === 'voiceMinTier') value = Number(value);
    command('setAudio', { [key]: value });
  });
});
$('#test-voice').addEventListener('click', () => command('testVoice'));

// ---------- Simulador ----------
const simUser = () => $('#sim-user').value.trim() || 'simulador';

// Si se eligió equipo, el usuario "escribe" su equipo en el chat antes (mismo camino que un espectador real)
function joinTeamIfNeeded(user = simUser(), team = $('#sim-team').value) {
  if (team) simulate({ type: 'chat', user, message: `!team ${team}` });
}

function sendGift({ user = simUser(), diamonds, giftId, giftName, streak = Number($('#gift-streak').value) || 1, team } = {}) {
  joinTeamIfNeeded(user, team === undefined ? $('#sim-team').value : team);
  simulate({ type: 'gift', user, diamondCount: diamonds, giftId, giftName: giftName || `Regalo ${diamonds}💎`, streak });
}

document.querySelectorAll('[data-gift]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const d = Number(btn.dataset.gift);
    sendGift(d === 1 ? { diamonds: 1, giftId: 5655, giftName: 'Rose' } : { diamonds: d });
  });
});

async function loadCatalog() {
  try {
    const res = await fetch(`/data/gift-catalog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error();
    const data = await res.json();
    catalog = Object.values(data.gifts || {}).sort((a, b) => a.diamonds - b.diamonds);
  } catch (e) {
    catalog = [];
  }
  const sel = $('#catalog-select');
  sel.innerHTML = catalog.length
    ? catalog.map((g, i) => `<option value="${i}">${escapeHtml(g.name)} · ${g.diamonds}💎 (id ${g.id}${g.timesSeen ? `, visto ${g.timesSeen}` : ''})</option>`).join('')
    : '<option>sin catálogo todavía (se llena con el primer live real)</option>';
  $('#catalog-info').textContent = catalog.length ? `(${catalog.length} regalos)` : '';
}
$('#send-catalog-gift').addEventListener('click', () => {
  const g = catalog[Number($('#catalog-select').value)];
  if (g) sendGift({ diamonds: g.diamonds, giftId: g.id, giftName: g.name });
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

// Ráfaga caos: `count` regalos aleatorios en `durationMs`, de 12 usuarios repartidos en los dos equipos
$('#chaos-burst').addEventListener('click', () => chaosBurst(50, 10000));
function chaosBurst(count, durationMs) {
  const tiers = [1, 1, 1, 1, 5, 5, 5, 30, 30, 100, 500];
  const users = Array.from({ length: 12 }, (_, i) => `caos_${i + 1}`);
  users.forEach((u, i) => joinTeamIfNeeded(u, i % 3 === 2 ? '' : i % 2 ? 'p2' : 'p1'));
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const diamonds = tiers[Math.floor(Math.random() * tiers.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      simulate({
        type: 'gift',
        user,
        diamondCount: diamonds,
        giftName: diamonds === 1 ? 'Rose' : `Regalo ${diamonds}💎`,
        giftId: diamonds === 1 ? 5655 : undefined,
        streak: diamonds === 1 ? 1 + Math.floor(Math.random() * 3) : 1,
      });
    }, (i * durationMs) / count);
  }
}

// ---------- Moderación ----------
$('#block-add').addEventListener('click', () => {
  const user = $('#block-user').value.trim().replace(/^@/, '');
  if (user) command('blockUser', user);
  $('#block-user').value = '';
});

// ---------- Eventos ----------
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

connect();
loadCatalog();
setInterval(loadCatalog, 60000);
setInterval(renderStatus, 1000);

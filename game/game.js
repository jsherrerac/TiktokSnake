'use strict';

/* =========================================================
   Snake TikTok Live
   - Fase 1: grid 30x53, IA con BFS, auto-restart con countdown.
             Lógica a 15 ticks/s, render a 60 FPS con interpolación.
   - Fase 2: modo PvP (2 serpientes) con rondas ganadas persistentes.
   - Fase 3: temáticas (colores, nombres, banderas dibujadas en canvas), cambio en caliente y rotación automática.
   - Fase 4: items (mega-food, bomba, speed, wall) y velocidad independiente por serpiente.
   - Fase 5 (base): cliente WebSocket del puente TikTok, dispatcher de eventos y teams por chat (!team).
   - Fase 6: victory dance (la ganadora dibuja una figura con el cuerpo antes de cerrar la ronda).
   - Fase 5: regalos/likes/follows/shares -> efectos (config/gift-mapping.json), cola con prioridad y crédito al donante.
   - Audio: efectos procedurales o CC0 (Kenney), música opcional, voz con plantillas fijas y filtro de nombres.
   ========================================================= */

// ---------- Modo de juego ----------
// "SOLO" = 1 serpiente | "PVP" = 2 serpientes. Es lo único que hay que cambiar para alternar.
// También se puede cambiar desde la consola: MODE = 'SOLO'; game.resetGame()
let MODE = 'PVP';

// ---------- Configuración general ----------
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const COLS = 20;
const ROWS = 26;
const CELL = 54;
const CELL_COUNT = COLS * ROWS; // 520

// Los primeros ~200px los tapa la barra superior de TikTok Live (nombre del streamer, viewers):
// el HUD vive debajo, entre HUD_TOP y HUD_BOTTOM, y el grid empieza después.
// Ancho: 20 * 54 = 1080px exacto. Alto: GRID_Y = 480; 480 + 26 * 54 = 1884 -> sobran 36px abajo.
const HUD_TOP = 200;
const HUD_BOTTOM = 460;
const GRID_X = 0;
const GRID_Y = 480;

const TICK_RATE = 15;                 // movimientos por segundo
const TICK_MS = 1000 / TICK_RATE;
const RESTART_DELAY_MS = 3000;        // countdown tras morir
// Comidas simultáneas en el mapa, según el modo
const FOOD_COUNT = { SOLO: 3, PVP: 2 };
const INITIAL_LENGTH = 4;
// Ticks sin comer tras los cuales la IA ignora del todo el chequeo de seguridad (evita bucles eternos).
// A partir de la mitad de este límite el chequeo se va relajando gradualmente.
const STALL_LIMIT_TICKS = { SOLO: CELL_COUNT * 2, PVP: CELL_COUNT };
// Probabilidad por tick de arriesgarse a entrar en una celda disputada con la cabeza rival (rompe empates de órbita)
const CONTESTED_RISK_CHANCE = 0.15;
const BEST_SCORE_KEY = 'snakeTikTok.bestScore';

// ---------- Items ----------
// lifetimeMs: null = dura hasta que alguien lo toque. warnMs: aviso visual antes de expirar.
const ITEM_TYPES = {
  MEGA_FOOD: { color: '#ffd700', lifetimeMs: null, score: 5, growth: 3 },
  BOMB: { color: '#ff0033', lifetimeMs: 12000, warnMs: 3000, decorationMs: 500 },
  SPEED: { color: '#00ffff', lifetimeMs: 10000, warnMs: 2000, effectMs: 5000, tickRate: 22 },
  WALL: { color: '#888888', lifetimeMs: 10000, warnMs: 1500 },
};
// Qué hace la IA con los items. Configurable en caliente (game.AI_CONFIG) para ajustar el juego en Fase 5.
const AI_CONFIG = {
  avoidWalls: true,     // interruptor general: si es false, la IA nunca ve los muros
  avoidBombs: true,     // interruptor general: si es false, la IA nunca ve las bombas
  // La IA solo "ve" bombas y muros a esta distancia manhattan de su cabeza (o menos)
  BOMB_VISION_RADIUS: 3,
  // Con la bomba/muro pegado a la cabeza (distancia 1), probabilidad de no reaccionar, como un humano despistado
  BOMB_MISS_CHANCE: 0.30,
  seekMegaFood: true,   // va a por la mega-food como si fuera comida
  seekSpeed: true,      // va a por el speed como si fuera comida
};
// Marcador PvP persistente, separado por temática: { [themeId]: { p1Wins, p2Wins, draws } }
const STATS_KEY = 'snakeTikTok.themeStats';

// ---------- Temáticas ----------
// Cada temática define nombre, colores y bandera (flagId -> FLAG_RENDERERS) de cada jugador, y el fondo.
// Las banderas se dibujan con canvas porque Chrome en Windows no pinta los emojis de bandera (🇨🇴 sale como "CO").
// El orden de las keys es el orden de la rotación automática.
const THEMES = {
  'colombia-argentina': {
    displayName: 'Colombia vs Argentina',
    p1: { name: 'COLOMBIA', color: '#ffcd00', innerColor: '#ffe066', headColor: '#fff099', flagId: 'colombia', flagLabel: 'COL', aliases: ['colombiano'] },
    p2: { name: 'ARGENTINA', color: '#75aadb', innerColor: '#a8ccea', headColor: '#c3dbef', flagId: 'argentina', flagLabel: 'ARG', aliases: ['argentino'] },
    background: '#0a0a15',
  },
  'real-barca': {
    displayName: 'Real Madrid vs Barcelona',
    p1: { name: 'REAL', color: '#ffffff', innerColor: '#f0f0f0', headColor: '#e0e0e0', flagId: 'real', flagLabel: 'RMA', aliases: ['madrid', 'realmadrid'] },
    p2: { name: 'BARÇA', color: '#a50044', innerColor: '#c1005a', headColor: '#d81b60', flagId: 'barca', flagLabel: 'FCB', aliases: ['barcelona', 'barsa'] },
    background: '#0a0a15',
  },
  'manzana-naranja': {
    displayName: 'Manzana vs Naranja',
    p1: { name: 'MANZANA', color: '#e63946', innerColor: '#f28b93', headColor: '#f5a5ab', flagId: 'manzana', flagLabel: 'MZN', aliases: ['apple'] },
    p2: { name: 'NARANJA', color: '#ff8c00', innerColor: '#ffb04d', headColor: '#ffc370', flagId: 'naranja', flagLabel: 'NRJ', aliases: ['orange'] },
    background: '#0a0a15',
  },
};
const DEFAULT_THEME = 'colombia-argentina';
// Cada cuánto rota la temática sola en modo PVP
const THEME_ROTATION_MS = 20 * 60 * 1000;
// Duración del cartel "PRÓXIMA RONDA"
const THEME_BANNER_MS = 2000;

// ---------- Victory dance ----------
// PVP: la rival debe llevar muerta más de VICTORY_RIVAL_DEAD_MS y la superviviente tener VICTORY_MIN_SCORE.PVP.
// SOLO: basta con llegar a VICTORY_MIN_SCORE.SOLO (celebración de hito).
const VICTORY_RIVAL_DEAD_MS = 3000;
const VICTORY_MIN_SCORE = { PVP: 30, SOLO: 100 };
const DANCE_DURATION_MS = 10000;
const DANCE_PATTERNS = ['spiral', 'square', 'heart', 'infinity', 'zigzag'];
const DANCE_PATTERN_LABELS = { spiral: 'ESPIRAL', square: 'CUADRADO', heart: 'CORAZÓN', infinity: 'INFINITO', zigzag: 'ZIGZAG' };
const DANCE_TRAIL_FADE_MS = 8000; // lo que tardan en desvanecerse los puntos dorados de los waypoints visitados
const GOLD = '#ffd700';

// ---------- Puente TikTok ----------
// Servido por el puente (http://localhost:8080/) usa el mismo host; abierto como archivo, el puerto por defecto.
// Desde otro servidor (p. ej. Live Server) se puede indicar con ?bridge=ws://localhost:8080
const BRIDGE_URL =
  new URLSearchParams(location.search).get('bridge') ||
  (location.protocol.startsWith('http') ? `ws://${location.host}` : 'ws://localhost:8080');
const BRIDGE_RETRY_MS = 5000;
const GAME_STATUS_INTERVAL_MS = 2000; // cada cuánto el juego reporta fps/errores al panel

// ---------- Ajustes (config/settings.json, editable sin tocar código) ----------
// Valores por defecto; si el juego se sirve por HTTP se sobrescriben con config/settings.json.
const SETTINGS = {
  showConnectionDot: true, // punto verde/amarillo/rojo del estado de conexión, arriba a la izquierda
  // Quién puede cambiar la temática con "!theme" en el chat: 'mods' (dueño y moderadores), 'all' u 'off'
  chatThemeCommand: 'mods',
  // Unirse a un equipo escribiendo solo el nombre ("colombia", "arg"), además de "!team colombia"
  joinTeamByName: true,
};

// Lee un JSON de config/ (solo si el juego se sirve por HTTP; con file:// Chrome bloquea el fetch)
async function loadConfigJson(name) {
  if (!location.protocol.startsWith('http')) return null;
  try {
    const res = await fetch(`/config/${name}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn(`[config] no se pudo cargar config/${name}: ${e.message}`);
    return null;
  }
}

async function loadSettings() {
  const loaded = await loadConfigJson('settings.json');
  if (!loaded) return;
  Object.assign(SETTINGS, loaded);
  // "audio" de settings.json es la base; lo guardado desde el panel en este navegador manda
  if (loaded.audio && typeof loaded.audio === 'object') {
    Object.assign(AUDIO_DEFAULTS, loaded.audio);
    audio.settings = { ...AUDIO_DEFAULTS };
    loadAudioSettings();
    applyAudioSettings();
  }
}

// Orden fijo: arriba, derecha, abajo, izquierda
const DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// ---------- Estado global del juego ----------
const state = {
  mode: MODE,         // modo de la ronda en curso (se fija en resetGame)
  phase: 'playing',   // 'playing' | 'dancing' | 'dead'
  snakes: [],
  roundResult: null,  // PvP: { winner: snake } o { winner: null } si fue empate
  stats: loadStats(), // PvP: { [themeId]: { p1Wins, p2Wins, draws } }, persistente
  currentTheme: DEFAULT_THEME,  // temática que se usará en la PRÓXIMA ronda
  roundTheme: DEFAULT_THEME,    // temática de la ronda en curso (la que se ve en pantalla)
  themeBanner: null,            // { themeId, startedAt } mientras se muestra el cartel de cambio
  lastThemeRotationAt: performance.now(),
  bridgeConnected: false,       // true mientras hay conexión con el puente de TikTok
  bridgeStatus: null,           // último estado que manda el puente (TikTok conectado, mock...)
  teams: new Map(),             // username -> 'p1' | 'p2' (se vacía al cambiar de temática)
  knownUsers: new Set(),        // usuarios vistos en cualquier evento de TikTok (para contar neutrales)
  effectQueue: [],              // efectos de regalos/likes pendientes (ver processEffectQueue)
  queueTokens: 0,
  likes: { total: 0, p1: 0, p2: 0, nextGlobal: 0, nextP1: 0, nextP2: 0, nextSolo: 0 },
  roundDonations: new Map(),    // usuario -> diamantes en la ronda en curso (para el MVP)
  announcements: [],            // carteles grandes ("💥 @x eliminó a Y", ataque épico)
  alerts: [],                   // avisos de regalos/follows (el feed visual llega en el Bloque 4)
  floaters: [],                 // textos "+N" que suben y se desvanecen
  shake: { until: 0, magnitude: 0 },
  audioLocked: false,           // el navegador aún no deja sonar audio (hace falta un clic)
  lastCountdownNumber: null,
  metrics: { gifts: 0, units: 0, effects: 0, overflow: 0 },
  foods: [],
  items: [],          // { type, x, y, bornAt, expiresAt, meta }
  activeEffects: [],  // { snakeId, type, until }
  particles: [],
  deathAt: 0,
  roundStartedAt: 0,
  now: 0,               // timestamp del frame en curso
  pendingWinner: null,  // PVP: la que queda sola gana, aunque la ronda aún no se haya cerrado
  danceTriggered: false, // la danza ya se lanzó en esta ronda (solo una vez por ronda)
  dance: null,          // { snakeId, pattern, startedAt, visited: [{ x, y, at }] }
  round: 0,
  bestScore: loadBestScore(),
  debug: false,
};

// ---------- Utilidades ----------
const cellIndex = (x, y) => y * COLS + x;
const inBounds = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;
const cellCenterX = (x) => GRID_X + x * CELL + CELL / 2;
const cellCenterY = (y) => GRID_Y + y * CELL + CELL / 2;
const isOpposite = (a, b) => a.x === -b.x && a.y === -b.y;

function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// localStorage puede fallar (modo privado, file:// bloqueado): siempre con try/catch
function loadBestScore() {
  try {
    return parseInt(localStorage.getItem(BEST_SCORE_KEY), 10) || 0;
  } catch (e) {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch (e) {
    /* sin persistencia, no pasa nada */
  }
}

function loadStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATS_KEY));
    return saved && typeof saved === 'object' ? saved : {};
  } catch (e) {
    return {};
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    /* sin persistencia, no pasa nada */
  }
}

// Marcador de una temática (lo crea vacío si todavía no existe)
function getThemeStats(themeId) {
  if (!state.stats[themeId]) state.stats[themeId] = { p1Wins: 0, p2Wins: 0, draws: 0 };
  return state.stats[themeId];
}

// ---------- Creación de entidades ----------
// Los colores, nombre y bandera salen de la temática de la ronda según el id ('p1' | 'p2')
function createSnake(id, startX, startY, dir) {
  const config = THEMES[state.roundTheme][id];
  const body = [];
  // El cuerpo se extiende en dirección contraria al movimiento
  for (let i = 0; i < INITIAL_LENGTH; i++) {
    body.push({ x: startX - dir.x * i, y: startY - dir.y * i });
  }
  return {
    id,
    body,
    prevBody: body.map((c) => ({ x: c.x, y: c.y })),
    dir,
    alive: true,
    moved: false,          // si se movió en el último tick (para interpolar)
    score: 0,
    growPending: 0,        // segmentos extra por crecer (mega-food suma varios)
    ticksSinceFood: 0,
    moves: 0,              // movimientos totales en la ronda (sirve para medir la velocidad real)
    tickInterval: TICK_MS, // ms entre movimientos; SPEED lo reduce
    moveAccumulator: 0,    // ms acumulados desde el último movimiento
    deathTimestamp: null,  // cuándo murió (para la condición de victoria inminente)
    dancing: false,        // true mientras hace la victory dance (la IA normal se apaga)
    danceWaypoints: [],
    danceIndex: 0,
    danceBudget: null,     // pasos que le quedan para alcanzar el waypoint actual antes de saltarlo
    name: config.name,
    color: config.color,
    innerColor: config.innerColor,
    headColor: config.headColor,
    flagId: config.flagId,
  };
}

// Mapa de celdas ocupadas por serpientes, comida o items
function buildOccupiedGrid() {
  const occupied = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    for (const c of snake.body) {
      if (inBounds(c.x, c.y)) occupied[cellIndex(c.x, c.y)] = 1;
    }
  }
  for (const f of state.foods) occupied[cellIndex(f.x, f.y)] = 1;
  for (const it of state.items) occupied[cellIndex(it.x, it.y)] = 1;
  return occupied;
}

// Devuelve una celda vacía aleatoria (sin serpientes, comida ni items), o null si el mapa está lleno
function findEmptyCell() {
  const occupied = buildOccupiedGrid();

  // Primero intentos aleatorios (rápido), luego barrido completo como respaldo
  for (let i = 0; i < 100; i++) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (!occupied[cellIndex(x, y)]) return { x, y };
  }
  const empties = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!occupied[i]) empties.push({ x: i % COLS, y: Math.floor(i / COLS) });
  }
  return empties.length ? empties[Math.floor(Math.random() * empties.length)] : null;
}

// `now` es el timestamp del frame en curso: así bornAt nunca queda por delante del render
function refillFoods(now) {
  while (state.foods.length < FOOD_COUNT[state.mode]) {
    const cell = findEmptyCell();
    if (!cell) break;
    state.foods.push({ x: cell.x, y: cell.y, bornAt: now });
  }
}

// ---------- IA ----------

// ¿Tiene comida en una celda vecina a la cabeza? (podría comerla este tick y no mover la cola)
function isHeadNextToFood(snake) {
  const head = snake.body[0];
  const near = (c) => Math.abs(c.x - head.x) + Math.abs(c.y - head.y) === 1;
  return state.foods.some(near) || state.items.some((it) => it.type === 'MEGA_FOOD' && near(it));
}

// ¿La IA de `viewer` trata este item como pared en esta decisión? Solo muros y bombas activas, y solo si:
// - están a BOMB_VISION_RADIUS o menos de su cabeza (de lejos no los ve), y
// - pegados a la cabeza (distancia 1), además pasan la tirada de BOMB_MISS_CHANCE (si falla, no reacciona).
// La tirada se hace en cada decisión, así que un despiste dura solo ese paso.
function isItemObstacleForAI(item, viewer) {
  // Las bombas teledirigidas de un regalo son invisibles para la culebra atacada (si no, casi nunca matarían);
  // la del equipo del donante las ve con las reglas normales
  if (item.meta.hiddenFrom === viewer.id) return false;
  let watched = false;
  if (item.type === 'WALL') watched = AI_CONFIG.avoidWalls;
  else if (item.type === 'BOMB') watched = AI_CONFIG.avoidBombs && !item.meta.detonatedAt;
  if (!watched) return false;
  const head = viewer.body[0];
  const distance = Math.abs(item.x - head.x) + Math.abs(item.y - head.y);
  if (distance > AI_CONFIG.BOMB_VISION_RADIUS) return false;
  if (distance === 1 && Math.random() < AI_CONFIG.BOMB_MISS_CHANCE) return false;
  return true;
}

// Items que la IA persigue como si fueran comida (según AI_CONFIG)
function isItemTargetForAI(item) {
  if (item.type === 'MEGA_FOOD') return AI_CONFIG.seekMegaFood;
  if (item.type === 'SPEED') return AI_CONFIG.seekSpeed;
  return false;
}

// Mapa de obstáculos tal como lo ve `viewer`: todos los cuerpos, propios y ajenos, más muros/bombas.
// Las colas cuentan como libres si esa serpiente se mueve en este mismo paso (`movers`) y no va a crecer.
// Para un rival no sabemos qué va a decidir: si tiene comida al lado, puede comer y dejar la cola quieta,
// así que en ese caso su cola se trata como bloqueada.
function buildBlockedGrid(viewer, movers) {
  const blocked = new Uint8Array(CELL_COUNT);
  for (const item of state.items) {
    if (isItemObstacleForAI(item, viewer)) blocked[cellIndex(item.x, item.y)] = 1;
  }
  for (const snake of state.snakes) {
    const len = snake.body.length;
    const mightGrow = snake.growPending > 0 || (snake !== viewer && isHeadNextToFood(snake));
    const tailFree = snake.alive && movers.includes(snake) && !mightGrow;
    for (let i = 0; i < len; i++) {
      if (tailFree && i === len - 1) continue;
      const c = snake.body[i];
      blocked[cellIndex(c.x, c.y)] = 1;
    }
  }
  return blocked;
}

// BFS desde la cabeza hasta la comida más cercana. Devuelve la primera dirección del camino o null.
function bfsFirstStep(head, blocked, firstDirs) {
  const foodMask = new Uint8Array(CELL_COUNT);
  for (const f of state.foods) foodMask[cellIndex(f.x, f.y)] = 1;
  for (const it of state.items) {
    if (isItemTargetForAI(it)) foodMask[cellIndex(it.x, it.y)] = 1;
  }

  const visited = new Uint8Array(CELL_COUNT);
  const firstDir = new Int8Array(CELL_COUNT);
  const queue = new Int32Array(CELL_COUNT);
  let qHead = 0;
  let qTail = 0;
  visited[cellIndex(head.x, head.y)] = 1;

  // Primer nivel: guardamos con qué dirección se salió de la cabeza
  for (const d of firstDirs) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (!inBounds(nx, ny)) continue;
    const n = cellIndex(nx, ny);
    if (blocked[n] || visited[n]) continue;
    if (foodMask[n]) return d;
    visited[n] = 1;
    firstDir[n] = DIRECTIONS.indexOf(d);
    queue[qTail++] = n;
  }

  while (qHead < qTail) {
    const c = queue[qHead++];
    const cx = c % COLS;
    const cy = (c - cx) / COLS;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRECTIONS[k].x;
      const ny = cy + DIRECTIONS[k].y;
      if (!inBounds(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (blocked[n] || visited[n]) continue;
      // La primera comida alcanzada es la más cercana (BFS por niveles)
      if (foodMask[n]) return DIRECTIONS[firstDir[c]];
      visited[n] = 1;
      firstDir[n] = firstDir[c];
      queue[qTail++] = n;
    }
  }
  return null;
}

// Cuenta cuántas celdas libres son alcanzables desde (sx, sy). Sirve para no meterse en callejones.
function floodFillArea(sx, sy, blocked) {
  const visited = new Uint8Array(CELL_COUNT);
  const queue = new Int32Array(CELL_COUNT);
  let qHead = 0;
  let qTail = 0;
  const start = cellIndex(sx, sy);
  visited[start] = 1;
  queue[qTail++] = start;

  while (qHead < qTail) {
    const c = queue[qHead++];
    const cx = c % COLS;
    const cy = (c - cx) / COLS;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRECTIONS[k].x;
      const ny = cy + DIRECTIONS[k].y;
      if (!inBounds(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (blocked[n] || visited[n]) continue;
      visited[n] = 1;
      queue[qTail++] = n;
    }
  }
  return qTail;
}

// Celdas a las que una cabeza rival podría moverse este tick (riesgo de choque de cabezas = empate)
function buildHeadDangerGrid(viewer) {
  const danger = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    if (snake === viewer || !snake.alive) continue;
    const head = snake.body[0];
    for (const d of DIRECTIONS) {
      const nx = head.x + d.x;
      const ny = head.y + d.y;
      if (inBounds(nx, ny)) danger[cellIndex(nx, ny)] = 1;
    }
  }
  return danger;
}

// Espacio libre mínimo que debe quedar tras ir a por comida.
// Normal: el largo del cuerpo. Si lleva más de la mitad de STALL_LIMIT_TICKS sin comer,
// la exigencia baja linealmente hasta 0 al llegar al límite (anti-cobardía gradual).
function requiredSafeArea(snake) {
  const limit = STALL_LIMIT_TICKS[state.mode];
  const half = limit / 2;
  const relax = Math.max(0, Math.min(1, (snake.ticksSinceFood - half) / half));
  return Math.ceil(snake.body.length * (1 - relax));
}

// Decide la próxima dirección:
// 1) camino BFS a la comida más cercana, si tras el paso queda espacio suficiente para el cuerpo;
// 2) si no, el movimiento que deje más espacio libre (sobrevivir).
// En ambos casos se evitan las celdas donde podría entrar una cabeza rival, salvo que no haya alternativa.
function decideDirection(snake, movers) {
  const head = snake.body[0];
  const blocked = buildBlockedGrid(snake, movers);
  // Orden aleatorio para que la IA no se vea robótica en los empates
  const options = shuffled(DIRECTIONS).filter((d) => !isOpposite(d, snake.dir));
  const isFree = (d, grid) => {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    return inBounds(nx, ny) && !grid[cellIndex(nx, ny)];
  };

  const valid = options.filter((d) => isFree(d, blocked));
  if (valid.length === 0) return snake.dir; // no hay salida: muerte inevitable

  // Si hay movimientos que no arriesgan choque de cabezas, trabajamos solo con ellos
  const danger = buildHeadDangerGrid(snake);
  const cautious = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) cautious[i] = blocked[i] | danger[i];
  const safeMoves = valid.filter((d) => isFree(d, cautious));
  const grid = safeMoves.length > 0 ? cautious : blocked;
  const candidates = safeMoves.length > 0 ? safeMoves : valid;

  const areaAfter = (d) => floodFillArea(head.x + d.x, head.y + d.y, grid);
  const minArea = requiredSafeArea(snake);
  const foodDir = bfsFirstStep(head, grid, candidates);

  // Comida disputada: si la comida está a 1 paso pero en una celda de peligro, a veces se arriesga.
  // Sin esto, dos serpientes pueden orbitar la misma comida para siempre sin que ninguna se atreva.
  // Si lleva mucho sin comer (relajación activa) también se arriesga cuando la zona de peligro
  // le corta el único camino, y al estancarse del todo se arriesga siempre.
  if (safeMoves.length > 0) {
    const riskyDir = bfsFirstStep(head, blocked, valid);
    if (riskyDir) {
      const nx = head.x + riskyDir.x;
      const ny = head.y + riskyDir.y;
      const contested = danger[cellIndex(nx, ny)] === 1;
      const stepIsFood = state.foods.some((f) => f.x === nx && f.y === ny);
      const cautiousPathExists = foodDir !== null;
      const stalledOut = minArea === 0;
      const relaxing = minArea < snake.body.length;
      if (contested && (stepIsFood || (relaxing && !cautiousPathExists))) {
        const chance = stalledOut ? 1 : CONTESTED_RISK_CHANCE;
        if (Math.random() < chance && floodFillArea(nx, ny, blocked) >= minArea) return riskyDir;
      }
    }
  }

  if (foodDir && areaAfter(foodDir) >= minArea) return foodDir;

  let bestDir = candidates[0];
  let bestArea = -1;
  for (const d of candidates) {
    const area = areaAfter(d);
    if (area > bestArea) {
      bestArea = area;
      bestDir = d;
    }
  }
  return bestDir;
}

// ---------- Lógica por paso ----------
// Cada serpiente se mueve a su propio ritmo (tickInterval). Las que coinciden en el tiempo se mueven
// juntas en un mismo paso (así el choque de cabezas sigue siendo simultáneo entre serpientes a la misma
// velocidad); las demás se mueven por separado, en orden cronológico (ver advanceSnakes).

// Mueve una serpiente una celda y resuelve comida e items. Puede matarla (bomba, muro).
function moveSnake(snake, now) {
  snake.prevBody = snake.body.map((c) => ({ x: c.x, y: c.y }));
  const head = snake.body[0];
  const next = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };
  snake.body.unshift(next);
  snake.ticksSinceFood++;
  snake.moves++;

  const foodIdx = state.foods.findIndex((f) => f.x === next.x && f.y === next.y);
  if (foodIdx !== -1) {
    state.foods.splice(foodIdx, 1);
    snake.score++;
    snake.growPending++;
    snake.ticksSinceFood = 0;
    playEat(snake);
    spawnBurst(cellCenterX(next.x), cellCenterY(next.y), '#ff3b5c', 14);
  }

  // Items: se comprueban antes que los choques con cuerpos
  collectItemAt(snake, next, now);
  if (!snake.alive) return;

  // Crecer = no quitar la cola este paso
  if (snake.growPending > 0) snake.growPending--;
  else snake.body.pop();
  snake.moved = true;

  if (snake.dancing) {
    advanceDanceProgress(snake, now);
    // Partículas doradas cada 3 movimientos
    if (snake.moves % 3 === 0) spawnBurst(cellCenterX(next.x), cellCenterY(next.y), GOLD, 8);
  }
}

// Aplica el item que haya en la celda de la cabeza (si hay alguno)
function collectItemAt(snake, cell, now) {
  const idx = state.items.findIndex((it) => it.x === cell.x && it.y === cell.y);
  if (idx === -1) return;
  const item = state.items[idx];
  const def = ITEM_TYPES[item.type];
  const px = cellCenterX(cell.x);
  const py = cellCenterY(cell.y);

  if (item.type === 'MEGA_FOOD') {
    state.items.splice(idx, 1);
    snake.score += def.score;
    snake.growPending += def.growth;
    snake.ticksSinceFood = 0;
    spawnBurst(px, py, def.color, 30);
    playSound('megaFood');
    console.info(`[item] ${snake.name} come MEGA_FOOD (+${def.score}) en (${cell.x},${cell.y})`);
  } else if (item.type === 'SPEED') {
    state.items.splice(idx, 1);
    applySpeedEffect(snake, now);
    spawnBurst(px, py, def.color, 20);
    console.info(`[item] ${snake.name} toma SPEED en (${cell.x},${cell.y}) durante ${def.effectMs / 1000}s`);
  } else if (item.type === 'BOMB') {
    if (item.meta.detonatedAt) return; // ya explotó: solo decoración
    // La bomba queda un momento como decoración (onda expansiva) y luego desaparece
    item.meta.detonatedAt = now;
    item.expiresAt = now + def.decorationMs;
    killSnake(snake, now, true);
    playSound('explosion');
    spawnBurst(px, py, def.color, 60);
    console.info(`[item] BOMB mata a ${snake.name} en (${cell.x},${cell.y})`);
    if (item.meta.donor) announceKill(item.meta, snake, now);
  } else if (item.type === 'WALL') {
    killSnake(snake, now);
    console.info(`[item] WALL mata a ${snake.name} en (${cell.x},${cell.y})`);
    if (item.meta.donor) announceKill(item.meta, snake, now);
  }
}

// Un paso de lógica para el grupo de serpientes `movers` (las que se mueven en este instante)
function stepSnakes(movers, now) {
  expireItems(now);

  // 1) Todas las IA del grupo deciden con el mismo estado del mapa
  for (const snake of movers) {
    snake.dir = snake.dancing ? decideDirectionDance(snake) : decideDirection(snake, movers);
  }

  // 2) Movimiento, comida e items
  for (const snake of movers) moveSnake(snake, now);

  // 3) Colisiones: paredes y cualquier cuerpo (propio o ajeno), solo para las que se movieron.
  // Se cuenta cuántos segmentos hay en cada celda DESPUÉS de mover. Casos:
  // - Cabeza contra cuerpo ajeno: la celda de la cabeza que pega tiene 2 -> muere solo esa;
  //   la otra cabeza está en una celda con 1 -> sobrevive.
  // - Dos cabezas en la misma celda en el mismo paso: esa celda tiene 2 -> mueren las dos.
  // - Cruce de cabezas (se intercambian celdas): cada cabeza cae sobre el cuello de la otra -> mueren las dos.
  // - Serpientes a distinta velocidad: la que entra en la celda donde ya está la otra es la que choca.
  // Durante la danza, los cuerpos muertos (que se están desvaneciendo) ya no cuentan como obstáculo.
  const occupancy = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    if (!snake.alive && state.phase === 'dancing') continue;
    for (const c of snake.body) {
      if (inBounds(c.x, c.y)) occupancy[cellIndex(c.x, c.y)]++;
    }
  }
  const crashed = [];
  for (const snake of movers) {
    if (!snake.alive) continue; // ya murió por un item
    const h = snake.body[0];
    if (!inBounds(h.x, h.y) || occupancy[cellIndex(h.x, h.y)] > 1) {
      killSnake(snake, now, true);
      crashed.push(snake);
    }
  }
  // Dos que chocan en el mismo paso: choque de cabezas; si no, el sonido de muerte normal
  if (crashed.length >= 2) playSound('headOn');
  else if (crashed.length === 1) playSound('death');

  // 4) Reponer comida
  refillFoods(now);

  // 5) Si en este paso quedó una sola viva, esa gana (el cierre de la ronda lo decide updateRoundStatus)
  lockWinnerIfDecided();
}

// La ronda está en juego (normal o con la danza en curso)
function isRoundActive() {
  return state.phase === 'playing' || state.phase === 'dancing';
}

// ¿Se mueve esta serpiente ahora? Durante la danza solo se mueve la que baila; las demás miran.
function canMove(snake) {
  return snake.alive && (state.phase !== 'dancing' || snake.dancing);
}

// PVP: cuando queda una sola viva, esa es la ganadora de la ronda (se fija una vez)
function lockWinnerIfDecided() {
  if (state.mode !== 'PVP' || state.pendingWinner) return;
  const alive = state.snakes.filter((s) => s.alive);
  if (alive.length !== 1) return;
  state.pendingWinner = alive[0];
  console.info(`[ronda ${state.round}] ${alive[0].name} queda sola y gana; ${VICTORY_RIVAL_DEAD_MS / 1000} s antes de cerrar`);
}

// Decide cada frame si la ronda sigue, si arranca la danza o si se cierra.
// - PVP: al quedar una sola, sigue jugando VICTORY_RIVAL_DEAD_MS. Si entonces tiene VICTORY_MIN_SCORE.PVP,
//   baila; si no, la ronda se cierra normal. Si choca antes, gana igual (fue la última en pie).
// - SOLO: al llegar a VICTORY_MIN_SCORE.SOLO baila; si muere, la ronda se cierra.
// - Danza: se cierra al completar los waypoints, a los DANCE_DURATION_MS o si la que baila choca.
function updateRoundStatus(now) {
  if (!isRoundActive()) return;
  // Una muerte hecha a mano desde la consola (alive = false) no pasa por killSnake: le ponemos la hora aquí
  for (const snake of state.snakes) {
    if (!snake.alive && snake.deathTimestamp === null) snake.deathTimestamp = now;
  }
  lockWinnerIfDecided();

  if (state.phase === 'dancing') {
    const dancer = state.snakes.find((s) => s.dancing);
    if (!dancer || !dancer.alive) {
      console.info('[danza] la serpiente chocó: la danza termina antes de tiempo');
      endRound(now);
    } else if (dancer.danceIndex >= dancer.danceWaypoints.length) {
      console.info(`[danza] figura completa en ${((now - state.dance.startedAt) / 1000).toFixed(1)} s`);
      endRound(now);
    } else if (now - state.dance.startedAt >= DANCE_DURATION_MS) {
      console.info(`[danza] ${DANCE_DURATION_MS / 1000} s cumplidos (waypoint ${dancer.danceIndex}/${dancer.danceWaypoints.length})`);
      endRound(now);
    }
    return;
  }

  const alive = state.snakes.filter((s) => s.alive);
  if (alive.length === 0) {
    endRound(now);
    return;
  }
  const candidate = state.mode === 'PVP' ? (alive.length === 1 ? alive[0] : null) : alive[0];
  if (!candidate) return;
  if (!state.danceTriggered && checkVictoryInminent(candidate, now)) {
    triggerVictoryDance(candidate, undefined, now);
    return;
  }
  if (state.mode === 'PVP') {
    const rival = state.snakes.find((s) => s !== candidate);
    if (now - rival.deathTimestamp > VICTORY_RIVAL_DEAD_MS) endRound(now);
  }
}

// ¿Cumple `snake` la condición de victoria inminente?
function checkVictoryInminent(snake, now = state.now) {
  if (!snake || !snake.alive || snake.dancing) return false;
  if (state.mode === 'PVP') {
    const rival = state.snakes.find((s) => s !== snake);
    if (!rival || rival.alive || rival.deathTimestamp === null) return false;
    return now - rival.deathTimestamp > VICTORY_RIVAL_DEAD_MS && snake.score >= VICTORY_MIN_SCORE.PVP;
  }
  return snake.score >= VICTORY_MIN_SCORE.SOLO;
}

// Mueve a todas las serpientes vivas a la vez (atajo para pruebas desde consola)
function tick(now = performance.now()) {
  stepSnakes(state.snakes.filter((s) => s.alive), now);
}

// Avanza la lógica según el tiempo acumulado de cada serpiente. Primero se mueve la más atrasada;
// las que coinciden (diferencia < 1 ms) se mueven en el mismo paso.
function advanceSnakes(now) {
  for (let guard = 0; guard < 32 && isRoundActive(); guard++) {
    const ready = state.snakes.filter((s) => canMove(s) && s.moveAccumulator >= s.tickInterval);
    if (ready.length === 0) break;
    const lateness = (s) => s.moveAccumulator - s.tickInterval;
    const maxLate = Math.max(...ready.map(lateness));
    const movers = ready.filter((s) => maxLate - lateness(s) < 1);
    for (const s of movers) s.moveAccumulator -= s.tickInterval;
    stepSnakes(movers, now);
    perf.ticks++;
  }
}

// ---------- Items: spawn, efectos y expiración ----------

// Acepta 'MEGA_FOOD' / 'mega-food' / 'mega_food', etc. Devuelve la key de ITEM_TYPES o null.
function normalizeItemType(type) {
  const key = String(type).trim().toUpperCase().replace(/-/g, '_');
  return ITEM_TYPES[key] ? key : null;
}

// Mete un item en el mapa. Sin coordenadas, en una celda vacía aleatoria.
// Devuelve el item creado, o null si el tipo no existe o no hay sitio.
// meta: datos del regalo que lo creó ({ donor, team, giftName, tier, label, hiddenFrom, homing })
function spawnItem(type, x, y, now = performance.now(), meta = {}) {
  const key = normalizeItemType(type);
  if (!key) {
    console.warn(`[item] tipo "${type}" no existe. Disponibles: ${Object.keys(ITEM_TYPES).join(', ')}`);
    return null;
  }
  let cell;
  if (x === undefined || y === undefined) {
    cell = findEmptyCell();
    if (!cell) {
      console.warn(`[item] no hay celdas libres para ${key}`);
      return null;
    }
  } else {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBounds(x, y)) {
      console.warn(`[item] (${x},${y}) está fuera del mapa (${COLS}x${ROWS})`);
      return null;
    }
    if (buildOccupiedGrid()[cellIndex(x, y)]) {
      console.warn(`[item] (${x},${y}) está ocupada`);
      return null;
    }
    cell = { x, y };
  }
  const def = ITEM_TYPES[key];
  const item = {
    type: key,
    x: cell.x,
    y: cell.y,
    bornAt: now,
    expiresAt: def.lifetimeMs ? now + def.lifetimeMs : null,
    meta: { ...meta },
  };
  state.items.push(item);
  if (key === 'BOMB') playSound('bombSpawn');
  else if (key === 'WALL') playSound('wallSpawn');
  console.info(`[item] ${key} en (${cell.x},${cell.y})`);
  return item;
}

// SPEED: la serpiente se mueve a ITEM_TYPES.SPEED.tickRate durante effectMs (si repite, se renueva)
function applySpeedEffect(snake, now) {
  const def = ITEM_TYPES.SPEED;
  const existing = state.activeEffects.find((e) => e.snakeId === snake.id && e.type === 'SPEED');
  if (existing) existing.until = now + def.effectMs;
  else state.activeEffects.push({ snakeId: snake.id, type: 'SPEED', until: now + def.effectMs });
  snake.tickInterval = 1000 / def.tickRate;
  playSound('speed');
  startHum(snake);
}

function endEffect(effect) {
  const snake = state.snakes.find((s) => s.id === effect.snakeId);
  if (!snake || effect.type !== 'SPEED') return;
  snake.tickInterval = TICK_MS;
  stopHum(snake.id);
  // Re-sincroniza su ritmo con el de una rival a velocidad normal, para que vuelvan a moverse
  // en el mismo paso (y el choque de cabezas simultáneo siga siendo posible)
  const rival = state.snakes.find((s) => s !== snake && s.alive && s.tickInterval === TICK_MS);
  if (rival) snake.moveAccumulator = rival.moveAccumulator;
  console.info(`[item] fin de SPEED para ${snake.name}`);
}

// Quita items y efectos vencidos
function expireItems(now) {
  state.items = state.items.filter((it) => it.expiresAt === null || it.expiresAt > now);
  const expired = state.activeEffects.filter((e) => e.until <= now);
  if (expired.length === 0) return;
  state.activeEffects = state.activeEffects.filter((e) => e.until > now);
  for (const effect of expired) endEffect(effect);
}

// silent: quien la llama pone su propio sonido (explosión, choque de cabezas)
function killSnake(snake, now = state.now, silent = false) {
  snake.alive = false;
  snake.deathTimestamp = now;
  stopHum(snake.id);
  if (!silent) playSound('death');
  // Congelamos la serpiente en su última posición válida (no dentro de la pared)
  snake.body = snake.prevBody;
  snake.moved = false;
  for (const c of snake.body) {
    spawnBurst(cellCenterX(c.x), cellCenterY(c.y), snake.color, 3);
  }
}

function endRound(now) {
  state.phase = 'dead';
  state.lastCountdownNumber = null;
  stopDanceLoop();
  stopAllHums();
  state.deathAt = now;
  for (const snake of state.snakes) {
    if (snake.score > state.bestScore) {
      state.bestScore = snake.score;
      saveBestScore(state.bestScore);
    }
  }

  const seconds = ((now - state.roundStartedAt) / 1000).toFixed(1);
  const scores = state.snakes.map((s) => `${s.name} ${s.score}`).join(' - ');

  const danced = state.dance !== null;
  const mvp = getRoundMvp();
  if (mvp) console.info(`[ronda ${state.round}] MVP: ${mvp.user} (${mvp.diamonds} diamantes)`);
  if (state.mode === 'PVP') {
    // Gana la última en pie (fijada al quedar sola, aunque luego chocara) o la que bailó; si no, empate
    const survivors = state.snakes.filter((s) => s.alive);
    const winner = state.pendingWinner || (survivors.length === 1 ? survivors[0] : null);
    state.roundResult = { winner, danced, mvp };
    if (winner) {
      playSound('victory');
      speakTemplate('win', { team: spokenTeam(winner) });
    } else {
      speakTemplate('draw');
    }
    const s = getThemeStats(state.roundTheme);
    if (winner) s[`${winner.id}Wins`]++;
    else s.draws++;
    saveStats(state.stats);
    const [p1, p2] = state.snakes;
    console.info(
      `[ronda ${state.round}] ${winner ? `GANA ${winner.name}` : 'EMPATE'}${danced ? ` (con danza ${state.dance.pattern})` : ''} · puntos ${scores} · ${seconds}s` +
        ` · total ${p1.name} ${s.p1Wins} - ${s.p2Wins} ${p2.name}, empates ${s.draws}`
    );
  } else {
    state.roundResult = { winner: null, danced, mvp };
    if (danced) playSound('victory');
    console.info(`[ronda ${state.round}] fin${danced ? ` (con danza ${state.dance.pattern})` : ''} · puntos ${scores} · ${seconds}s`);
  }
}

function resetGame(now = performance.now()) {
  state.mode = MODE;
  // Aquí se aplica un cambio de temática pendiente. Los teams son de un matchup concreto: si cambia, se vacían.
  if (state.currentTheme !== state.roundTheme && state.teams.size > 0) {
    console.info(`[team] nueva temática: se reinician los teams (${state.teams.size} registrados)`);
    state.teams.clear();
    // Los likes por equipo son de ese matchup; el total del live se mantiene
    Object.assign(state.likes, { p1: 0, p2: 0, nextP1: 0, nextP2: 0 });
  }
  state.roundTheme = state.currentTheme;
  state.round++;
  stopAllHums();
  stopDanceLoop();
  if (state.round > 1) playSound('go');
  state.phase = 'playing';
  state.roundResult = null;
  state.roundStartedAt = now;
  state.pendingWinner = null;
  state.danceTriggered = false;
  state.dance = null;
  state.roundDonations = new Map();
  state.foods = [];
  state.items = [];
  state.activeEffects = [];
  state.particles = [];
  const midRow = Math.floor(ROWS / 2);
  if (state.mode === 'PVP') {
    // Arrancan encaradas en la fila central, en columnas simétricas (5 y 14 con COLS = 20)
    const p1Col = Math.floor(COLS / 4);
    state.snakes = [
      createSnake('p1', p1Col, midRow, DIRECTIONS[1]),             // mirando a la derecha
      createSnake('p2', COLS - 1 - p1Col, midRow, DIRECTIONS[3]),  // mirando a la izquierda
    ];
  } else {
    state.snakes = [createSnake('p1', Math.floor(COLS / 2), midRow, DIRECTIONS[0])];
  }
  refillFoods(now);
}

// ---------- Victory dance ----------

// Celda dentro del mapa más cercana a (x, y)
function clampCell(p) {
  return {
    x: Math.max(0, Math.min(COLS - 1, Math.round(p.x))),
    y: Math.max(0, Math.min(ROWS - 1, Math.round(p.y))),
  };
}

// Convierte puntos sueltos (pueden estar fuera del mapa o separados) en un camino de celdas contiguas
// (4-conexo) dentro del mapa, sin retrocesos A,B,A (la serpiente no puede dar media vuelta).
function toContiguousPath(points) {
  const path = [];
  for (const raw of points) {
    const target = clampCell(raw);
    if (path.length === 0) {
      path.push(target);
      continue;
    }
    let cur = path[path.length - 1];
    while (cur.x !== target.x || cur.y !== target.y) {
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      cur = Math.abs(dx) >= Math.abs(dy) ? { x: cur.x + Math.sign(dx), y: cur.y } : { x: cur.x, y: cur.y + Math.sign(dy) };
      path.push(cur);
    }
  }
  const clean = [];
  for (const c of path) {
    const n = clean.length;
    if (n >= 2 && clean[n - 2].x === c.x && clean[n - 2].y === c.y) {
      clean.pop();
      continue;
    }
    clean.push(c);
  }
  return clean;
}

// Espiral cuadrada de dentro hacia afuera: derecha, arriba, izquierda, abajo, con tramos crecientes.
// Los brazos van separados 2 celdas para que la figura se lea (no quede un bloque macizo).
function generateSpiralPattern(centerX, centerY, size) {
  const half = Math.floor(size / 2);
  const dirs = [[1, 0], [0, -1], [-1, 0], [0, 1]];
  const points = [{ x: centerX, y: centerY }];
  let x = centerX;
  let y = centerY;
  let run = 2;
  for (let turn = 0; ; turn++) {
    const [dx, dy] = dirs[turn % 4];
    const nx = x + dx * run;
    const ny = y + dy * run;
    if (Math.abs(nx - centerX) > half || Math.abs(ny - centerY) > half) break;
    x = nx;
    y = ny;
    points.push({ x, y });
    if (turn % 2 === 1) run += 2;
  }
  return toContiguousPath(points);
}

// Cuadrado hueco: el perímetro de un cuadrado de `size` celdas de lado centrado en (centerX, centerY)
// (el centro puede ser x.5 si el lado es par)
function generateSquarePattern(centerX, centerY, size) {
  const h = (size - 1) / 2;
  return toContiguousPath([
    { x: centerX - h, y: centerY - h },
    { x: centerX + h, y: centerY - h },
    { x: centerX + h, y: centerY + h },
    { x: centerX - h, y: centerY + h },
    { x: centerX - h, y: centerY - h },
  ]);
}

// Corazón con la curva paramétrica clásica (x = 16 sin³t, y = 13 cos t - 5 cos 2t - 2 cos 3t - cos 4t),
// centrado verticalmente y escalado a `scale` celdas de medio ancho.
function generateHeartPattern(centerX, centerY, scale) {
  const points = [];
  const samples = 160;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // hy va de -17 a ~12: se centra restando su punto medio (-2.5); y del canvas crece hacia abajo
    points.push({ x: centerX + (hx / 16) * scale, y: centerY - ((hy + 2.5) / 16) * scale });
  }
  return toContiguousPath(points);
}

// Infinito (lemniscata de Bernoulli), algo estirado en vertical para que los lazos se lean en el grid
function generateInfinityPattern(centerX, centerY, scale) {
  const points = [];
  const samples = 160;
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2;
    const den = 1 + Math.sin(t) ** 2;
    points.push({
      x: centerX + (scale * Math.cos(t)) / den,
      y: centerY + (1.6 * scale * Math.sin(t) * Math.cos(t)) / den,
    });
  }
  return toContiguousPath(points);
}

// Zigzag horizontal que barre un área: filas de izquierda a derecha y vuelta, separadas 2 celdas
function generateZigzagPattern(startX, startY, width, height) {
  const points = [];
  let leftToRight = true;
  for (let y = startY; y <= startY + height; y += 2) {
    points.push({ x: leftToRight ? startX : startX + width, y });
    points.push({ x: leftToRight ? startX + width : startX, y });
    leftToRight = !leftToRight;
  }
  return toContiguousPath(points);
}

// Centro real del mapa: con 20x26 celdas cae entre celdas (9.5, 12.5); las figuras simétricas lo usan
// para no quedar corridas media celda. La espiral necesita una celda concreta de arranque.
const MAP_CENTER_X = (COLS - 1) / 2;
const MAP_CENTER_Y = (ROWS - 1) / 2;
const DANCE_PATTERN_GENERATORS = {
  spiral: () => generateSpiralPattern(Math.floor(COLS / 2), Math.floor(ROWS / 2), 16),
  square: () => generateSquarePattern(MAP_CENTER_X, MAP_CENTER_Y, 16),
  heart: () => generateHeartPattern(MAP_CENTER_X, MAP_CENTER_Y, 8.5),
  infinity: () => generateInfinityPattern(MAP_CENTER_X, MAP_CENTER_Y, 8.5),
  zigzag: () => generateZigzagPattern(2, 5, COLS - 5, 14),
};
// Figuras cerradas: se recorren 2 veces y empiezan por el punto más cercano a la cabeza
const CLOSED_DANCE_PATTERNS = ['square', 'heart', 'infinity'];

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Waypoints de la figura, adaptados a dónde está la serpiente
function buildDanceWaypoints(pattern, head) {
  let path = DANCE_PATTERN_GENERATORS[pattern]();
  if (CLOSED_DANCE_PATTERNS.includes(pattern)) {
    // Quita el punto repetido del cierre, rota el lazo para empezar cerca de la cabeza y da 2 vueltas
    const loop = manhattan(path[0], path[path.length - 1]) === 0 ? path.slice(0, -1) : path;
    let start = 0;
    loop.forEach((c, i) => {
      if (manhattan(c, head) < manhattan(loop[start], head)) start = i;
    });
    const rotated = loop.slice(start).concat(loop.slice(0, start));
    path = rotated.concat(rotated, [rotated[0]]);
  } else if (pattern === 'zigzag' && manhattan(path[path.length - 1], head) < manhattan(path[0], head)) {
    path = path.slice().reverse(); // el zigzag puede empezar por cualquiera de sus extremos
  }
  return path;
}

// Arranca la victory dance de `snake`. Sin patrón (o con uno desconocido), elige uno al azar.
function triggerVictoryDance(snake, patternName, now = state.now) {
  if (!snake || !snake.alive || !isRoundActive()) {
    console.warn('[danza] solo puede bailar una serpiente viva con la ronda en juego');
    return false;
  }
  let pattern = patternName;
  if (!DANCE_PATTERN_GENERATORS[pattern]) {
    if (patternName !== undefined) console.warn(`[danza] patrón "${patternName}" no existe; se elige uno al azar`);
    pattern = DANCE_PATTERNS[Math.floor(Math.random() * DANCE_PATTERNS.length)];
  }
  // Si ya había otra bailando (llamada manual), deja de bailar
  for (const other of state.snakes) other.dancing = false;

  snake.dancing = true;
  snake.danceWaypoints = buildDanceWaypoints(pattern, snake.body[0]);
  snake.danceIndex = 0;
  snake.danceBudget = null;
  state.phase = 'dancing';
  state.danceTriggered = true;
  state.dance = { snakeId: snake.id, pattern, startedAt: now, visited: [] };
  startDanceLoop();
  if (state.mode === 'PVP') state.pendingWinner = snake;
  // Las demás se quedan quietas mirando (sin interpolar movimiento)
  for (const other of state.snakes) {
    if (other !== snake) other.moved = false;
  }
  console.info(`[danza] ${snake.name} baila "${pattern}" (${snake.danceWaypoints.length} waypoints, máx ${DANCE_DURATION_MS / 1000} s)`);
  return true;
}

// Marca como visitados los waypoints que la cabeza ya alcanzó
function advanceDanceProgress(snake, now) {
  const head = snake.body[0];
  const wps = snake.danceWaypoints;
  while (snake.danceIndex < wps.length && manhattan(wps[snake.danceIndex], head) === 0) {
    state.dance.visited.push({ x: head.x, y: head.y, at: now });
    snake.danceIndex++;
    snake.danceBudget = null;
  }
}

// Obstáculos para la que baila: su cuerpo (menos la cola si no crece), otras vivas, muros y bombas.
// Los cuerpos muertos no cuentan: se están desvaneciendo.
function buildDanceBlockedGrid(snake) {
  const blocked = new Uint8Array(CELL_COUNT);
  for (const item of state.items) {
    if (item.type === 'WALL' || (item.type === 'BOMB' && !item.meta.detonatedAt)) blocked[cellIndex(item.x, item.y)] = 1;
  }
  for (const other of state.snakes) {
    if (!other.alive) continue;
    const len = other.body.length;
    const tailFree = other === snake && other.growPending === 0;
    for (let i = 0; i < len; i++) {
      if (tailFree && i === len - 1) continue;
      blocked[cellIndex(other.body[i].x, other.body[i].y)] = 1;
    }
  }
  return blocked;
}

// BFS desde la cabeza hasta la celda `target`. Devuelve la primera dirección del camino o null si no se llega.
function bfsStepTowards(head, target, blocked, firstDirs) {
  const goal = cellIndex(target.x, target.y);
  const visited = new Uint8Array(CELL_COUNT);
  const firstDir = new Int8Array(CELL_COUNT);
  const queue = new Int32Array(CELL_COUNT);
  let qHead = 0;
  let qTail = 0;
  visited[cellIndex(head.x, head.y)] = 1;
  for (const d of firstDirs) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (!inBounds(nx, ny)) continue;
    const n = cellIndex(nx, ny);
    if (blocked[n] || visited[n]) continue;
    if (n === goal) return d;
    visited[n] = 1;
    firstDir[n] = DIRECTIONS.indexOf(d);
    queue[qTail++] = n;
  }
  while (qHead < qTail) {
    const c = queue[qHead++];
    const cx = c % COLS;
    const cy = (c - cx) / COLS;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIRECTIONS[k].x;
      const ny = cy + DIRECTIONS[k].y;
      if (!inBounds(nx, ny)) continue;
      const n = cellIndex(nx, ny);
      if (blocked[n] || visited[n]) continue;
      if (n === goal) return DIRECTIONS[firstDir[c]];
      visited[n] = 1;
      firstDir[n] = firstDir[c];
      queue[qTail++] = n;
    }
  }
  return null;
}

// Dirección durante la danza: el camino más corto (BFS) al waypoint actual, rodeando su propio cuerpo,
// muros y bombas. Se salta el waypoint si está tapado, si no hay camino, si ir hacia él la encerraría
// (queda menos espacio libre que su largo) o si no lo alcanza en un número razonable de pasos.
// Sin waypoints alcanzables, se mueve a donde tenga más espacio (el cierre lo decide updateRoundStatus).
// Si ninguna dirección es segura, choca y la danza termina.
function decideDirectionDance(snake) {
  const head = snake.body[0];
  const wps = snake.danceWaypoints;
  const blocked = buildDanceBlockedGrid(snake);
  const options = DIRECTIONS.filter((d) => !isOpposite(d, snake.dir));

  while (snake.danceIndex < wps.length) {
    const wp = wps[snake.danceIndex];
    if (snake.danceBudget === null) snake.danceBudget = manhattan(wp, head) * 2 + 6;
    const reachable = !blocked[cellIndex(wp.x, wp.y)] && snake.danceBudget-- > 0;
    const dir = reachable ? bfsStepTowards(head, wp, blocked, options) : null;
    if (dir && floodFillArea(head.x + dir.x, head.y + dir.y, blocked) >= snake.body.length) return dir;
    snake.danceIndex++;
    snake.danceBudget = null;
  }

  let best = options[0];
  let bestArea = -1;
  for (const d of options) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (!inBounds(nx, ny) || blocked[cellIndex(nx, ny)]) continue;
    const area = floodFillArea(nx, ny, blocked);
    if (area > bestArea) {
      bestArea = area;
      best = d;
    }
  }
  return best;
}

// ---------- Temáticas: cambio en caliente ----------

// Programa una temática para la PRÓXIMA ronda (no toca la ronda en curso) y muestra el cartel.
function setTheme(themeId, now = performance.now()) {
  if (!THEMES[themeId]) {
    console.warn(`[tema] "${themeId}" no existe. Disponibles: ${Object.keys(THEMES).join(', ')}`);
    return false;
  }
  // Cualquier cambio (manual o automático) reinicia el contador de rotación
  state.lastThemeRotationAt = now;
  if (themeId === state.currentTheme) return true; // sin cambio real: sin cartel
  state.currentTheme = themeId;
  state.themeBanner = { themeId, startedAt: now };
  playSound('themeChange');
  console.info(`[tema] próxima ronda: ${THEMES[themeId].displayName}`);
  return true;
}

// Rotación automática: en PVP, cada THEME_ROTATION_MS pasa a la siguiente temática (orden de las keys)
function updateThemeRotation(now) {
  if (state.mode !== 'PVP') return;
  if (now - state.lastThemeRotationAt < THEME_ROTATION_MS) return;
  const ids = Object.keys(THEMES);
  const next = ids[(ids.indexOf(state.currentTheme) + 1) % ids.length];
  console.info('[tema] rotación automática');
  setTheme(next, now);
}

// Milisegundos que faltan para la próxima rotación automática (para depurar desde consola)
function msUntilThemeRotation(now = performance.now()) {
  return Math.max(0, THEME_ROTATION_MS - (now - state.lastThemeRotationAt));
}

// Comandos de chat que entiende el juego:
//   !theme <id>     cambia la temática de la próxima ronda (ids con guiones: [\w-]+)
//   !team <equipo>  se une a un equipo del matchup actual. Admite acentos y ç (\S+): "!team barça".
// Devuelve true si el mensaje era un comando y se aplicó.
// meta: { isModerator, isOwner } del evento de chat (TikTok los manda en userIdentity).
// "!theme" solo lo pueden usar el dueño y los moderadores (SETTINGS.chatThemeCommand).
function onChatCommand(username, message, meta = {}) {
  const text = String(message || '').trim();
  const themeMatch = /^!theme\s+([\w-]+)/i.exec(text);
  if (themeMatch) {
    const themeId = themeMatch[1].toLowerCase();
    const policy = SETTINGS.chatThemeCommand;
    const allowed = policy === 'all' || (policy === 'mods' && (meta.isModerator || meta.isOwner));
    if (!allowed) {
      console.info(`[chat] !theme de ${username} ignorado (${policy === 'off' ? 'desactivado' : 'solo dueño y moderadores'})`);
      return false;
    }
    console.info(`[chat] ${username} pide temática "${themeId}"`);
    return setTheme(themeId);
  }
  const teamMatch = /^!team\s+(\S+)/i.exec(text);
  if (teamMatch) return registerTeam(username, teamMatch[1]) !== null;
  return false;
}

// ---------- Teams (PvP por equipos de espectadores) ----------

// Minúsculas, sin acentos ni signos: "Barça" -> "barca", "Real-Madrid" -> "realmadrid"
function normalizeTeamName(name) {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Traduce lo que escribe el espectador a 'p1' | 'p2' según la temática en pantalla, o null si no encaja
function resolveTeamSlot(teamName, themeId = state.roundTheme) {
  const wanted = normalizeTeamName(teamName);
  const theme = THEMES[themeId];
  for (const slot of ['p1', 'p2']) {
    const player = theme[slot];
    const names = [slot, player.name, player.flagLabel, player.flagId, ...(player.aliases || [])];
    if (names.some((n) => normalizeTeamName(n) === wanted)) return slot;
  }
  return null;
}

// Registra (o cambia) el equipo de un usuario. Devuelve 'p1' | 'p2', o null si el equipo no existe en este matchup.
function registerTeam(username, teamName) {
  const theme = THEMES[state.roundTheme];
  const slot = resolveTeamSlot(teamName);
  if (!slot) {
    console.info(`[team] ${username}: "${teamName}" no es un equipo de ${theme.displayName}`);
    return null;
  }
  const previous = state.teams.get(username);
  state.knownUsers.add(username);
  if (previous === slot) return slot; // ya estaba en ese equipo: sin log ni sonido
  state.teams.set(username, slot);
  playSound('teamJoin');
  const change = previous && previous !== slot ? ` (antes ${theme[previous].name})` : '';
  console.info(`[team] ${username} -> ${theme[slot].name} (${slot})${change}`);
  return slot;
}

// Unirse a un equipo escribiendo solo el nombre o un alias ("colombia", "col", "dale arg").
// Para no dispararse con frases largas: el mensaje debe EMPEZAR por el alias, o tener 3 palabras o menos
// y mencionar un solo equipo. "colombia vs argentina" (dos equipos, no empieza... sí empieza) cuenta como colombia.
function tryJoinTeamFromChat(username, message) {
  if (state.mode !== 'PVP' || !SETTINGS.joinTeamByName) return false;
  const words = String(message || '').trim().split(/\s+/).map(normalizeTeamName).filter(Boolean);
  if (words.length === 0) return false;
  const first = resolveTeamSlot(words[0]);
  if (first) return registerTeam(username, words[0]) !== null;
  if (words.length > 3) return false;
  const slots = new Set(words.map((w) => resolveTeamSlot(w)).filter(Boolean));
  if (slots.size !== 1) return false; // no menciona equipo, o menciona los dos
  return registerTeam(username, [...slots][0]) !== null;
}

// Cuántos espectadores hay en cada equipo; neutral = vistos en algún evento pero sin equipo
function getTeamCounts() {
  const counts = { p1: 0, p2: 0, neutral: 0 };
  for (const slot of state.teams.values()) counts[slot]++;
  for (const user of state.knownUsers) {
    if (!state.teams.has(user)) counts.neutral++;
  }
  return counts;
}

// ---------- Puente TikTok: cliente WebSocket ----------

// Conecta con el puente (bridge/tiktok-bridge.js). Si no está o se cae, reintenta cada BRIDGE_RETRY_MS.
// Nota: mientras el puente esté apagado, Chrome escribe "WebSocket connection to ... failed" en la consola
// en cada intento. Lo emite la capa de red del navegador (no es una excepción de JS), así que no se puede
// silenciar: se probó con try/catch + onerror.preventDefault(), capturando 'error' en window, abriendo el
// WebSocket dentro de un Worker y sondeando antes con fetch (que deja su propio "Failed to load resource").
// Para no verlo: en DevTools > Console > ajustes, marcar "Hide network". En OBS la consola no se ve.
let bridgeSocket = null;

function connectToBridge() {
  let socket;
  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch (e) {
    setTimeout(connectToBridge, BRIDGE_RETRY_MS);
    return;
  }
  socket.onopen = () => {
    bridgeSocket = socket;
    state.bridgeConnected = true;
    socket.send(JSON.stringify({ kind: 'hello', role: 'game' }));
    console.info(`[bridge] conectado a ${BRIDGE_URL}`);
  };
  socket.onmessage = (msg) => {
    let data;
    try {
      data = JSON.parse(msg.data);
    } catch (e) {
      console.warn('[bridge] mensaje que no es JSON:', msg.data);
      return;
    }
    // Mensajes del sistema llevan `kind`; los eventos de TikTok, `type`
    if (data.kind) handleBridgeMessage(data);
    else handleTikTokEvent(data);
  };
  socket.onclose = () => {
    if (state.bridgeConnected) console.info(`[bridge] desconectado; reintentando cada ${BRIDGE_RETRY_MS / 1000} s`);
    state.bridgeConnected = false;
    state.bridgeStatus = null;
    bridgeSocket = null;
    setTimeout(connectToBridge, BRIDGE_RETRY_MS);
  };
  // onerror siempre va seguido de onclose, que es quien reintenta
  socket.onerror = () => {};
}

function sendToBridge(obj) {
  if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN) bridgeSocket.send(JSON.stringify(obj));
}

// Mensajes del puente que no son eventos de TikTok: estado de la conexión y órdenes del panel
function handleBridgeMessage(msg) {
  if (msg.kind === 'status') {
    state.bridgeStatus = msg;
  } else if (msg.kind === 'command') {
    handleControlCommand(msg.command, msg.args);
  }
}

// Prueba del zumbido de SPEED desde el panel (2 s)
function testHum() {
  const fake = { id: 'test' };
  startHum(fake);
  setTimeout(() => stopHum('test'), 2000);
}

// Órdenes del panel de control (se amplían en el Bloque 5)
const CONTROL_COMMANDS = {
  reloadMapping: () => loadGiftMapping(true),
  setAudio: (patch) => setAudioSettings(patch || {}),
  testSound: (name) => (name === 'speedHum' ? testHum() : playSound(name)),
  testVoice: () => say('Prueba de voz. ¡Gana Colombia!'),
  blockUser: (user) => setBlockedUser(user, true),
  unblockUser: (user) => setBlockedUser(user, false),
  reloadNameFilter: () => loadNameFilter(),
};

function handleControlCommand(command, args) {
  const handler = CONTROL_COMMANDS[command];
  if (!handler) {
    console.warn(`[panel] orden desconocida: ${command}`);
    return;
  }
  try {
    handler(args);
  } catch (err) {
    console.error(`[panel] error en la orden ${command}`, err);
  }
}

// Reporte periódico al panel: fps, ronda, errores
function reportGameStatus() {
  sendToBridge({
    kind: 'gameStatus',
    fps: perf.fps,
    tps: perf.tps,
    round: state.round,
    phase: state.phase,
    mode: state.mode,
    theme: state.roundTheme,
    errors: perf.errorsTotal,
    items: state.items.length,
    queue: state.effectQueue.length,
    metrics: state.metrics,
    likes: state.likes,
    audio: {
      settings: audio.settings,
      locked: state.audioLocked,
      contextState: audio.ctx ? audio.ctx.state : 'none',
      voice: tts.voice ? `${tts.voice.name} (${tts.voice.lang})` : null,
      kenney: audio.kenneyState,
      sounds: [...SOUND_NAMES, 'speedHum'],
    },
    blockedUsers: [...blockedUsers],
  });
}

// Dispatcher de eventos de TikTok (contrato en README). Por ahora solo registra el evento y atiende
// los comandos de chat; el mapeo de regalos/likes/follows a acciones del juego llega en la Fase 5.
function handleTikTokEvent(event) {
  if (!event || typeof event.type !== 'string') {
    console.warn('[tiktok] evento sin tipo, ignorado:', event);
    return;
  }
  try {
    const user = event.user || 'anónimo';
    state.knownUsers.add(user);
    console.info(`[tiktok] ${event.type} de ${user} (modo ${state.mode})`, event);
    switch (event.type) {
      case 'gift':
        processGiftEvent({ ...event, user });
        break;
      case 'like':
        processLikeEvent({ ...event, user });
        break;
      case 'follow':
        processFollowEvent({ ...event, user });
        break;
      case 'share':
        processShareEvent({ ...event, user });
        break;
      case 'chat':
        if (!onChatCommand(user, event.message, event)) tryJoinTeamFromChat(user, event.message);
        break;
      default:
        break;
    }
  } catch (err) {
    // Un evento raro nunca debe tumbar el juego
    console.error('[tiktok] error procesando evento', event, err);
  }
}

// ---------- Regalos -> efectos (config/gift-mapping.json) ----------
// Respaldo por si no se puede leer el JSON (juego abierto como archivo). La fuente de verdad es el JSON.
const DEFAULT_GIFT_MAPPING = {
  "tiers": [
    {
      "id": "T1",
      "minDiamonds": 1,
      "label": "pequeño"
    },
    {
      "id": "T2",
      "minDiamonds": 5,
      "label": "mediano"
    },
    {
      "id": "T3",
      "minDiamonds": 30,
      "label": "grande"
    },
    {
      "id": "T4",
      "minDiamonds": 100,
      "label": "enorme"
    },
    {
      "id": "T5",
      "minDiamonds": 500,
      "label": "épico"
    }
  ],
  "overrides": {
    "byGiftId": {},
    "byName": {}
  },
  "pvp": {
    "T1": {
      "text": "comida extra para tu equipo",
      "actions": [
        {
          "do": "megaFood",
          "target": "ally"
        }
      ]
    },
    "T2": {
      "text": "velocidad para tu equipo",
      "actions": [
        {
          "do": "speed",
          "target": "ally"
        }
      ]
    },
    "T3": {
      "text": "muro delante del rival",
      "actions": [
        {
          "do": "wallLine",
          "target": "rival",
          "length": 3,
          "minDistance": 3,
          "maxDistance": 4
        }
      ]
    },
    "T4": {
      "text": "bomba teledirigida al rival",
      "actions": [
        {
          "do": "homingBomb",
          "target": "rival",
          "pattern": "ahead",
          "distance": 2
        }
      ]
    },
    "T5": {
      "text": "ATAQUE ÉPICO: 3 bombas al rival + 3 comidas",
      "actions": [
        {
          "do": "homingBomb",
          "target": "rival",
          "pattern": "trap",
          "distance": 2
        },
        {
          "do": "megaFood",
          "target": "ally",
          "count": 3
        },
        {
          "do": "epic"
        }
      ]
    }
  },
  "pvpNoTeam": {
    "T1": {
      "text": "comida en el centro",
      "actions": [
        {
          "do": "megaFood",
          "target": "center"
        }
      ]
    },
    "T2": {
      "text": "comida en el centro",
      "actions": [
        {
          "do": "megaFood",
          "target": "center"
        }
      ]
    },
    "T3": {
      "useSolo": true
    },
    "T4": {
      "useSolo": true
    },
    "T5": {
      "useSolo": true
    }
  },
  "solo": {
    "T1": {
      "text": "comida o velocidad",
      "actions": [
        {
          "do": "random",
          "options": [
            {
              "do": "megaFood",
              "target": "random"
            },
            {
              "do": "speed",
              "target": "ally"
            }
          ]
        }
      ]
    },
    "T2": {
      "text": "un muro",
      "actions": [
        {
          "do": "wall",
          "target": "random"
        }
      ]
    },
    "T3": {
      "text": "3 bombas",
      "actions": [
        {
          "do": "bomb",
          "target": "random",
          "count": 3
        }
      ]
    },
    "T4": {
      "text": "CAOS: bombas, muros y comida",
      "actions": [
        {
          "do": "bomb",
          "target": "random",
          "count": 5
        },
        {
          "do": "wall",
          "target": "random",
          "count": 3
        },
        {
          "do": "megaFood",
          "target": "random",
          "count": 2
        }
      ]
    },
    "T5": {
      "text": "CAOS ÉPICO",
      "actions": [
        {
          "do": "bomb",
          "target": "random",
          "count": 5
        },
        {
          "do": "wall",
          "target": "random",
          "count": 3
        },
        {
          "do": "megaFood",
          "target": "random",
          "count": 2
        },
        {
          "do": "epic"
        }
      ]
    }
  },
  "likes": {
    "pvp": {
      "teamGoal": 300,
      "teamText": "comida para tu equipo",
      "teamActions": [
        {
          "do": "megaFood",
          "target": "ally"
        }
      ],
      "globalGoal": 1000,
      "globalText": "lluvia de comida",
      "globalActions": [
        {
          "do": "megaFood",
          "target": "center",
          "count": 5
        }
      ]
    },
    "solo": {
      "goal": 100,
      "text": "comida extra",
      "actions": [
        {
          "do": "megaFood",
          "target": "random"
        }
      ]
    }
  },
  "follow": {
    "text": "¡Gracias por seguir, @{user}!",
    "actions": [
      {
        "do": "megaFood",
        "target": "center"
      }
    ]
  },
  "share": {
    "text": "velocidad para tu equipo",
    "actions": [
      {
        "do": "speed",
        "target": "userTeam"
      }
    ]
  },
  "queue": {
    "maxEffectsPerSecond": 10,
    "maxLength": 1500
  },
  "caps": {
    "BOMB": 8,
    "WALL": 6,
    "MEGA_FOOD": 6,
    "SPEED": 4
  },
  "overflowPoints": {
    "T1": 1,
    "T2": 2,
    "T3": 5,
    "T4": 10,
    "T5": 25,
    "like": 1,
    "follow": 1,
    "share": 1
  }
};
let GIFT_MAPPING = normalizeMapping(DEFAULT_GIFT_MAPPING);
let mappingVersion = 0; // sube en cada recarga (las instrucciones en pantalla se regeneran)

function normalizeMapping(m) {
  const copy = JSON.parse(JSON.stringify(m));
  copy.tiers.sort((a, b) => a.minDiamonds - b.minDiamonds);
  return copy;
}

async function loadGiftMapping(fromPanel = false) {
  const loaded = await loadConfigJson('gift-mapping.json');
  if (loaded && Array.isArray(loaded.tiers) && loaded.pvp && loaded.solo) {
    GIFT_MAPPING = normalizeMapping(loaded);
    mappingVersion++;
    console.info(`[mapeo] config/gift-mapping.json cargado${fromPanel ? ' (recargado desde el panel)' : ''}`);
    return true;
  }
  if (loaded) console.warn('[mapeo] gift-mapping.json no tiene el formato esperado; se mantiene el anterior');
  return false;
}

const tierNumber = (tierId) => Number(String(tierId).replace(/\D/g, '')) || 1;

// Tier de UNA unidad del regalo: override por id o nombre; si no, por diamantes
function resolveGiftTier(event) {
  const overrides = GIFT_MAPPING.overrides || {};
  const byId = overrides.byGiftId && overrides.byGiftId[String(event.giftId)];
  if (byId) return byId;
  const byName = overrides.byName || {};
  const nameKey = Object.keys(byName).find((k) => k.toLowerCase() === String(event.giftName || '').toLowerCase());
  if (nameKey) return byName[nameKey];
  const diamonds = Math.max(1, Number(event.diamondCount) || 1);
  let tier = GIFT_MAPPING.tiers[0].id;
  for (const t of GIFT_MAPPING.tiers) if (diamonds >= t.minDiamonds) tier = t.id;
  return tier;
}

// Regla que aplica: PVP con equipo, PVP sin equipo (T3+ usa la de SOLO) o SOLO
function giftRule(tier, team) {
  if (state.mode === 'PVP') {
    if (team) return GIFT_MAPPING.pvp[tier];
    const noTeam = GIFT_MAPPING.pvpNoTeam && GIFT_MAPPING.pvpNoTeam[tier];
    if (noTeam && !noTeam.useSolo) return noTeam;
  }
  return GIFT_MAPPING.solo[tier];
}

const snakeBySlot = (slot) => state.snakes.find((s) => s.id === slot) || null;
const teamOf = (user) => (state.mode === 'PVP' ? state.teams.get(user) || null : null);

function processGiftEvent(event) {
  const units = Math.max(1, Math.min(1000, Number(event.repeatCount) || 1));
  const diamonds = Math.max(0, Number(event.diamondCount) || 0);
  const tier = resolveGiftTier(event);
  const team = teamOf(event.user);
  const rule = giftRule(tier, team);
  state.metrics.gifts++;
  state.metrics.units += units;
  state.roundDonations.set(event.user, (state.roundDonations.get(event.user) || 0) + diamonds * units);
  pushAlert({ kind: 'gift', user: event.user, team, tier, units, giftName: event.giftName, event, text: rule && rule.text });
  const tierNum = tierNumber(tier);
  playSound(tierNum <= 1 ? 'giftSmall' : tierNum === 2 ? 'giftMedium' : 'giftBig');
  // Voz: agradece desde el tier mínimo; el T5 lo anuncia el ataque épico
  if (tierNum >= audio.settings.voiceMinTier && tierNum < 5) {
    speakTemplate('gift', { name: spokenName(event.user), gift: spokenGiftName(event.giftName) });
  }
  if (!rule || !Array.isArray(rule.actions)) {
    console.warn(`[regalo] sin regla para ${tier} (${state.mode}${team ? ', con equipo' : ''})`);
    return;
  }
  for (let i = 0; i < units; i++) {
    enqueueEffect({ kind: 'gift', tier, priority: tierNumber(tier), user: event.user, team, giftName: event.giftName, actions: rule.actions });
  }
}

// Likes: suman al equipo del usuario (PVP) o al total; cada meta se dispara una sola vez
function processLikeEvent(event) {
  const n = Math.max(0, Number(event.likeCount) || 0);
  if (n === 0) return;
  const L = state.likes;
  L.total += n;
  if (state.mode === 'PVP') {
    const cfg = GIFT_MAPPING.likes.pvp;
    const team = teamOf(event.user);
    if (team) {
      L[team] += n;
      const key = team === 'p1' ? 'nextP1' : 'nextP2';
      if (!L[key]) L[key] = cfg.teamGoal;
      while (L[team] >= L[key]) {
        console.info(`[likes] meta de ${snakeBySlot(team) ? snakeBySlot(team).name : team}: ${L[key]} likes`);
        pushAlert({ kind: 'likeGoal', team, text: `¡${L[key]} likes! ${cfg.teamText}` });
        playSound('likeGoal');
        enqueueEffect({ kind: 'like', tier: 'like', priority: 0.5, user: event.user, team, actions: cfg.teamActions });
        L[key] += cfg.teamGoal;
      }
    }
    if (!L.nextGlobal) L.nextGlobal = cfg.globalGoal;
    while (L.total >= L.nextGlobal) {
      console.info(`[likes] meta global: ${L.nextGlobal} likes`);
      pushAlert({ kind: 'likeGoal', team: null, text: `¡${L.nextGlobal} likes! ${cfg.globalText}` });
      playSound('likeGoal');
      enqueueEffect({ kind: 'like', tier: 'like', priority: 0.5, user: event.user, team: null, actions: cfg.globalActions });
      L.nextGlobal += cfg.globalGoal;
    }
  } else {
    const cfg = GIFT_MAPPING.likes.solo;
    if (!L.nextSolo) L.nextSolo = cfg.goal;
    while (L.total >= L.nextSolo) {
      console.info(`[likes] meta: ${L.nextSolo} likes`);
      pushAlert({ kind: 'likeGoal', team: null, text: `¡${L.nextSolo} likes! ${cfg.text}` });
      playSound('likeGoal');
      enqueueEffect({ kind: 'like', tier: 'like', priority: 0.5, user: event.user, team: null, actions: cfg.actions });
      L.nextSolo += cfg.goal;
    }
  }
}

function processFollowEvent(event) {
  const cfg = GIFT_MAPPING.follow;
  pushAlert({ kind: 'follow', user: event.user, team: teamOf(event.user), text: cfg.text.replace('{user}', displayHandle(event.user)) });
  playSound('follow');
  enqueueEffect({ kind: 'follow', tier: 'follow', priority: 0.5, user: event.user, team: teamOf(event.user), actions: cfg.actions });
}

function processShareEvent(event) {
  const cfg = GIFT_MAPPING.share;
  pushAlert({ kind: 'share', user: event.user, team: teamOf(event.user), text: cfg.text });
  enqueueEffect({ kind: 'share', tier: 'share', priority: 0.5, user: event.user, team: teamOf(event.user), actions: cfg.actions });
}

// ---------- Cola de efectos ----------
// Prioridad (T5 primero, FIFO dentro de cada nivel) y un máximo de efectos por segundo.
// Solo se aplican con la ronda en juego (en la cuenta atrás o la danza esperan). Nada se pierde en silencio:
// si la cola se llena, el trabajo más viejo de menor prioridad se convierte en puntos.
function enqueueEffect(job) {
  const q = state.effectQueue;
  const maxLength = (GIFT_MAPPING.queue && GIFT_MAPPING.queue.maxLength) || 1500;
  if (q.length >= maxLength) {
    let victim = q.length - 1; // el final de la cola es la menor prioridad
    const dropped = q.splice(victim, 1)[0];
    awardOverflow(dropped, 'cola llena');
  }
  let i = q.length;
  while (i > 0 && q[i - 1].priority < job.priority) i--;
  q.splice(i, 0, { ...job, createdAt: performance.now() });
}

function processEffectQueue(now, dt) {
  const rate = (GIFT_MAPPING.queue && GIFT_MAPPING.queue.maxEffectsPerSecond) || 10;
  state.queueTokens = Math.min(rate, state.queueTokens + (dt * rate) / 1000);
  if (state.phase !== 'playing') return;
  while (state.queueTokens >= 1 && state.effectQueue.length > 0) {
    state.queueTokens -= 1;
    runEffectJob(state.effectQueue.shift(), now);
  }
}

function runEffectJob(job, now) {
  let failed = 0;
  for (const action of job.actions || []) {
    try {
      failed += executeAction(action, job, now);
    } catch (err) {
      console.error('[regalo] error en la acción', action, err);
      failed++;
    }
  }
  state.metrics.effects++;
  if (failed > 0) awardOverflow(job, 'tope de items o sin sitio');
}

// Efecto que no se pudo aplicar -> puntos para el equipo (nunca se pierde en silencio)
function awardOverflow(job, reason) {
  const points = (GIFT_MAPPING.overflowPoints || {})[job.tier] || 1;
  const snake = recipientSnake(job);
  state.metrics.overflow++;
  if (!snake) {
    console.info(`[regalo] ${job.user}: ${reason}; no hay culebra a la que dar los puntos`);
    return;
  }
  snake.score += points;
  const head = snake.body[0];
  addFloater(`+${points}`, cellCenterX(head.x), cellCenterY(head.y) - CELL, snake.color);
  console.info(`[regalo] ${job.user} (${job.tier}): ${reason} -> +${points} puntos para ${snake.name}`);
}

function recipientSnake(job) {
  if (state.mode !== 'PVP') return state.snakes[0] || null;
  if (job.team && snakeBySlot(job.team)) return snakeBySlot(job.team);
  const alive = state.snakes.filter((s) => s.alive);
  const pool = alive.length ? alive : state.snakes;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// Culebra objetivo de una acción: ally (del equipo del donante), rival, userTeam (su equipo o una al azar), random
function resolveTargetSnake(target, job) {
  if (state.mode !== 'PVP') return state.snakes[0] || null;
  const ally = job.team ? snakeBySlot(job.team) : null;
  if (target === 'ally') return ally;
  if (target === 'rival') return job.team ? state.snakes.find((s) => s.id !== job.team) || null : null;
  if (target === 'userTeam' && ally) return ally;
  const alive = state.snakes.filter((s) => s.alive);
  return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
}

// Ejecuta una acción. Devuelve cuántas unidades NO se pudieron aplicar (0 = todo bien).
function executeAction(action, job, now) {
  const count = Math.max(1, Number(action.count) || 1);
  switch (action.do) {
    case 'megaFood':
      return spawnForAction('MEGA_FOOD', action, job, now, count);
    case 'wall':
      return spawnForAction('WALL', action, job, now, count);
    case 'bomb':
      return spawnForAction('BOMB', action, job, now, count);
    case 'speed': {
      const snake = resolveTargetSnake(action.target, job);
      if (!snake || !snake.alive) return 1;
      applySpeedEffect(snake, now);
      spawnBurst(cellCenterX(snake.body[0].x), cellCenterY(snake.body[0].y), ITEM_TYPES.SPEED.color, 16);
      return 0;
    }
    case 'wallLine':
      return spawnWallLine(action, job, now);
    case 'homingBomb':
      return spawnHomingBombs(action, job, now);
    case 'random': {
      const options = action.options || [];
      return options.length ? executeAction(options[Math.floor(Math.random() * options.length)], job, now) : 0;
    }
    case 'epic':
      triggerEpic(job, now);
      return 0;
    case 'points': {
      const snake = recipientSnake(job);
      if (snake) snake.score += Number(action.amount) || 1;
      return 0;
    }
    default:
      console.warn(`[regalo] acción desconocida: ${action.do}`);
      return 0;
  }
}

function capReached(type) {
  const cap = (GIFT_MAPPING.caps || {})[type];
  return cap !== undefined && state.items.filter((it) => it.type === type && !it.meta.detonatedAt).length >= cap;
}

// Datos del donante que se guardan en cada item (crédito, @usuario encima en T3+)
function donorMeta(job, extra = {}) {
  const tierNum = job.kind === 'gift' ? tierNumber(job.tier) : 0;
  const team = job.team ? snakeBySlot(job.team) : null;
  return {
    donor: job.user,
    team: job.team,
    giftName: job.giftName,
    tier: job.tier,
    label: tierNum >= 3 ? `@${displayHandle(job.user)}` : null,
    labelColor: team ? team.color : '#ffffff',
    ...extra,
  };
}

// Distancia mínima a cualquier cabeza viva (para no poner nada encima o pegado a una cabeza)
function minHeadDistance(x, y) {
  let best = Infinity;
  for (const s of state.snakes) {
    if (!s.alive) continue;
    best = Math.min(best, Math.abs(s.body[0].x - x) + Math.abs(s.body[0].y - y));
  }
  return best;
}

function isFreeCell(x, y, occupied, minHeadDist) {
  return inBounds(x, y) && !occupied[cellIndex(x, y)] && minHeadDistance(x, y) >= minHeadDist;
}

// Celda libre cerca de (cx, cy) a distancia [minD, maxD]; si se pasa `dir`, prefiere las de delante
function findCellNear(cx, cy, minD, maxD, dir, minHeadDist = 1) {
  const occupied = buildOccupiedGrid();
  const front = [];
  const any = [];
  for (let y = Math.max(0, cy - maxD); y <= Math.min(ROWS - 1, cy + maxD); y++) {
    for (let x = Math.max(0, cx - maxD); x <= Math.min(COLS - 1, cx + maxD); x++) {
      const d = Math.abs(x - cx) + Math.abs(y - cy);
      if (d < minD || d > maxD || !isFreeCell(x, y, occupied, minHeadDist)) continue;
      any.push({ x, y });
      if (dir && (x - cx) * dir.x + (y - cy) * dir.y > 0) front.push({ x, y });
    }
  }
  const pool = front.length ? front : any;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

// Celda libre al azar, a 2 o más de cualquier cabeza
function findSafeEmptyCell(minHeadDist = 2) {
  const occupied = buildOccupiedGrid();
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (isFreeCell(x, y, occupied, minHeadDist)) return { x, y };
  }
  const cells = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isFreeCell(x, y, occupied, minHeadDist)) cells.push({ x, y });
  return cells.length ? cells[Math.floor(Math.random() * cells.length)] : null;
}

// megaFood / wall / bomb según el objetivo: cerca de una culebra, en el centro o al azar
function spawnForAction(type, action, job, now, count) {
  let failed = 0;
  const hazard = type === 'WALL' || type === 'BOMB';
  for (let i = 0; i < count; i++) {
    if (capReached(type)) {
      failed++;
      continue;
    }
    let cell = null;
    if (action.target === 'center') {
      cell = findCellNear(Math.floor(COLS / 2), Math.floor(ROWS / 2), 0, 4, null, 2);
    } else if (action.target === 'ally' || action.target === 'userTeam') {
      const snake = resolveTargetSnake(action.target, job);
      if (snake && snake.alive) cell = findCellNear(snake.body[0].x, snake.body[0].y, 2, 5, snake.dir, 2);
    } else {
      cell = findSafeEmptyCell(hazard ? 2 : 1);
    }
    const item = cell && spawnItem(type, cell.x, cell.y, now, donorMeta(job, { label: i === 0 ? donorMeta(job).label : null }));
    if (!item) failed++;
  }
  return failed;
}

// Muro de `length` celdas cruzado delante de la rival, a minDistance..maxDistance de su cabeza
function spawnWallLine(action, job, now) {
  const length = Math.max(1, Number(action.length) || 3);
  const rival = resolveTargetSnake('rival', job);
  if (!rival || !rival.alive) return length;
  const head = rival.body[0];
  const d = rival.dir;
  const perp = { x: -d.y, y: d.x };
  const occupied = buildOccupiedGrid();
  const offsets = Array.from({ length }, (_, i) => i - Math.floor(length / 2));
  const minD = Number(action.minDistance) || 3;
  const maxD = Number(action.maxDistance) || minD;
  let best = null;
  for (let dist = minD; dist <= maxD && !best; dist++) {
    for (const shift of [0, -1, 1]) {
      const cells = offsets.map((o) => ({ x: head.x + d.x * dist + perp.x * (o + shift), y: head.y + d.y * dist + perp.y * (o + shift) }));
      if (cells.every((c) => isFreeCell(c.x, c.y, occupied, 2))) {
        best = cells;
        break;
      }
    }
  }
  // Sin sitio para la línea completa: se ponen las celdas válidas a la distancia mínima
  const cells = best || offsets.map((o) => ({ x: head.x + d.x * minD + perp.x * o, y: head.y + d.y * minD + perp.y * o })).filter((c) => isFreeCell(c.x, c.y, occupied, 2));
  let placed = 0;
  cells.forEach((c, i) => {
    if (capReached('WALL')) return;
    const meta = donorMeta(job);
    if (i !== Math.floor(cells.length / 2)) meta.label = null; // el @usuario solo en la celda central
    if (spawnItem('WALL', c.x, c.y, now, meta)) placed++;
  });
  return length - placed;
}

// Bombas teledirigidas: en el camino de la rival (nunca a distancia 0 o 1), invisibles para su IA.
// pattern 'ahead': 1 bomba a `distance` celdas delante (si está ocupada, una más allá).
// pattern 'trap': delante a 2 y a los dos costados del paso siguiente (se cierra la salida).
function spawnHomingBombs(action, job, now) {
  const rival = resolveTargetSnake('rival', job);
  const wanted = action.pattern === 'trap' ? 3 : 1;
  if (!rival || !rival.alive) return wanted;
  const head = rival.body[0];
  const d = rival.dir;
  const perp = { x: -d.y, y: d.x };
  const dist = Math.max(2, Number(action.distance) || 2);
  const occupied = buildOccupiedGrid();
  const groups =
    action.pattern === 'trap'
      ? [
          [{ x: head.x + d.x * dist, y: head.y + d.y * dist }, { x: head.x + d.x * (dist + 1), y: head.y + d.y * (dist + 1) }],
          [{ x: head.x + d.x * (dist - 1) + perp.x, y: head.y + d.y * (dist - 1) + perp.y }],
          [{ x: head.x + d.x * (dist - 1) - perp.x, y: head.y + d.y * (dist - 1) - perp.y }],
        ]
      : [[{ x: head.x + d.x * dist, y: head.y + d.y * dist }, { x: head.x + d.x * (dist + 1), y: head.y + d.y * (dist + 1) }]];
  let placed = 0;
  groups.forEach((options, i) => {
    if (capReached('BOMB')) return;
    const cell = options.find((c) => isFreeCell(c.x, c.y, occupied, 2));
    if (!cell) return;
    const meta = donorMeta(job, { hiddenFrom: rival.id, homing: true });
    if (i > 0) meta.label = null;
    if (spawnItem('BOMB', cell.x, cell.y, now, meta)) {
      placed++;
      occupied[cellIndex(cell.x, cell.y)] = 1;
    }
  });
  return wanted - placed;
}

// Ataque épico: cartel grande + temblor (la voz llega con el Bloque 3)
function triggerEpic(job, now) {
  const team = job.team ? snakeBySlot(job.team) : null;
  showAnnouncement(`⚡ ATAQUE ÉPICO de @${displayHandle(job.user)} ⚡`, { color: team ? team.color : GOLD, durationMs: 2800, shakeMs: 700, shakePx: 16 });
  playSound('giftEpic');
  speakTemplate('epic', { name: spokenName(job.user) });
}

// "💥 @juan eliminó a ARGENTINA" (o fuego amigo si la víctima es de su propio equipo)
function announceKill(meta, victim, now) {
  const team = meta.team ? snakeBySlot(meta.team) : null;
  const friendly = meta.team && meta.team === victim.id;
  console.info(`[regalo] ${meta.donor} ${friendly ? '(fuego amigo) alcanzó a' : 'eliminó a'} ${victim.name} con ${meta.giftName || 'un regalo'}`);
  const text = friendly ? `💥 ¡Fuego amigo! @${displayHandle(meta.donor)} alcanzó a ${victim.name}` : `💥 @${displayHandle(meta.donor)} eliminó a ${victim.name}`;
  showAnnouncement(text, { color: team ? team.color : '#ff5570', durationMs: 3000, shakeMs: 400, shakePx: 10 });
  if (!friendly) speakTemplate('kill', { name: spokenName(meta.donor), team: spokenTeam(victim) });
}

function getRoundMvp() {
  let mvp = null;
  for (const [user, diamonds] of state.roundDonations) {
    if (diamonds > 0 && (!mvp || diamonds > mvp.diamonds)) mvp = { user, diamonds };
  }
  return mvp;
}

// ---------- Nombres en pantalla ----------
// @usuario apto para mostrar: sin emojis ni símbolos raros, máximo 14 caracteres.
// Usuarios bloqueados -> "anónimo"; nombres que no pasan el filtro de groserías -> "alguien".
function displayHandle(user, max = NAME_FILTER.maxShownLength || 14) {
  if (isBlockedUser(user)) return 'anónimo';
  const clean = String(user || '').replace(/^@/, '').replace(/[^\p{L}\p{N}._]/gu, '');
  if (!clean || isNameOffensive(clean)) return 'alguien';
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

// Nombre de equipo para la voz ("COLOMBIA" -> "Colombia")
const spokenTeam = (snake) => (snake ? snake.name.charAt(0) + snake.name.slice(1).toLowerCase() : '');

// ---------- Avisos, carteles y textos flotantes ----------
const MAX_ALERTS = 3;
const ALERT_DURATION_MS = 6000;

function pushAlert(alert) {
  state.alerts.push({ ...alert, at: performance.now() });
  while (state.alerts.length > MAX_ALERTS) state.alerts.shift();
}

// Cartel grande centrado sobre el mapa; si hay varios, salen uno detrás de otro
function showAnnouncement(text, { color = GOLD, durationMs = 2500, shakeMs = 0, shakePx = 0 } = {}) {
  state.announcements.push({ text, color, durationMs, shakeMs, shakePx, startedAt: null });
  while (state.announcements.length > 6) state.announcements.splice(1, 1); // se descarta el más viejo en espera
}

function addFloater(text, x, y, color) {
  state.floaters.push({ text, x, y, color, bornAt: performance.now() });
  if (state.floaters.length > 40) state.floaters.shift();
}

function startShake(ms, px, now) {
  state.shake = { until: now + ms, magnitude: px, duration: ms };
}

// ---------- Audio ----------
// Buses: sfx y música (Web Audio) y voz (speechSynthesis, fuera de Web Audio). Volumen maestro y mute.
// Dos sets de efectos: "procedural" (sintetizado aquí, sin archivos, por defecto) y "kenney" (CC0, en assets/sfx/kenney).
// Ajustes: config/settings.json ("audio") como base; lo que se cambie desde el panel se guarda en este navegador.
const AUDIO_STORAGE_KEY = 'snakeTikTok.audio';
const AUDIO_DEFAULTS = {
  master: 0.8,
  sfx: 0.8,
  music: 0.25,
  tts: 1,
  muted: false,
  voice: true,
  musicOn: false,          // música de fondo: apagada por defecto
  soundSet: 'procedural',  // 'procedural' | 'kenney'
  voiceMinTier: 3,         // la voz agradece regalos desde este tier
  voiceLangs: ['es-CO', 'es-MX', 'es-US', 'es-419', 'es-ES', 'es'],
};
const PITCH_VARIATION = 0.05; // ±5 % en los sonidos repetitivos
const EAT_COMBO_RESET_MS = 2000;
const KENNEY_DIR = 'assets/sfx/kenney';
// Los .ogg de Kenney vienen mucho más fuertes que la síntesis (picos medidos ~0.5-1.1 frente a ~0.05-0.5)
const KENNEY_GAIN = 0.3;

const audio = {
  ctx: null,
  master: null,
  buses: {},
  settings: { ...AUDIO_DEFAULTS },
  noiseBuffer: null,
  active: {},          // sonido -> instancias sonando
  lastAt: {},          // sonido -> última vez (anti-spam)
  buffers: {},         // set kenney: sonido -> AudioBuffer
  kenneyState: 'idle', // idle | loading | ready | failed
  hums: new Map(),     // snakeId -> nodos del zumbido de SPEED
  danceTimer: null,
  eatCombo: new Map(), // snakeId -> { count, at }
  music: null,
  ducked: false,
};

function loadAudioSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_STORAGE_KEY));
    if (saved && typeof saved === 'object') Object.assign(audio.settings, saved);
  } catch (e) {
    /* sin preferencias guardadas */
  }
}

function saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_STORAGE_KEY, JSON.stringify(audio.settings));
  } catch (e) {
    /* sin persistencia */
  }
}

function initAudio() {
  loadAudioSettings();
  try {
    audio.ctx = new AudioContext();
  } catch (e) {
    console.warn('[audio] Web Audio no disponible');
    return;
  }
  const c = audio.ctx;
  // Compresor en la salida: una ráfaga de regalos no satura
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  comp.connect(c.destination);
  audio.master = c.createGain();
  audio.master.connect(comp);
  for (const bus of ['sfx', 'music']) {
    audio.buses[bus] = c.createGain();
    audio.buses[bus].connect(audio.master);
  }
  audio.noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const data = audio.noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  applyAudioSettings();
  // Sin gesto del usuario Chrome arranca el audio suspendido (salvo con --autoplay-policy=no-user-gesture-required)
  state.audioLocked = c.state !== 'running';
  c.onstatechange = () => {
    state.audioLocked = c.state !== 'running';
    if (!state.audioLocked) console.info('[audio] activo');
  };
  if (state.audioLocked) console.info('[audio] suspendido hasta un clic (arranca Chrome con --autoplay-policy=no-user-gesture-required para evitarlo)');
  const unlock = () => {
    if (audio.ctx.state !== 'running') audio.ctx.resume();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function applyAudioSettings() {
  const s = audio.settings;
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.02);
  audio.buses.sfx.gain.setTargetAtTime(s.sfx, t, 0.02);
  audio.buses.music.gain.setTargetAtTime(s.music * (audio.ducked ? 0.3 : 1), t, 0.15);
  if (s.soundSet === 'kenney') loadKenneySet();
  if (s.musicOn) startMusic();
  else stopMusic();
}

// Cambia ajustes (desde el panel) y los guarda
function setAudioSettings(patch) {
  for (const key of Object.keys(AUDIO_DEFAULTS)) {
    if (patch[key] !== undefined) audio.settings[key] = patch[key];
  }
  saveAudioSettings();
  applyAudioSettings();
  if (patch.voice === false || patch.muted === true) stopSpeaking();
}

// ---------- Síntesis procedural ----------
function synthTone(t0, { freq, dur, type = 'sine', gain = 0.25, attack = 0.005, slideTo = null, delay = 0, rate = 1, dest }) {
  const c = audio.ctx;
  const osc = c.createOscillator();
  const g = c.createGain();
  const start = t0 + delay;
  osc.type = type;
  osc.frequency.setValueAtTime(freq * rate, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo * rate), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.03);
  return delay + dur;
}

function synthNoise(t0, { dur, gain = 0.25, filter = 'lowpass', freq = 1200, freqTo = null, q = 1, delay = 0, dest }) {
  const c = audio.ctx;
  const src = c.createBufferSource();
  src.buffer = audio.noiseBuffer;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  const g = c.createGain();
  const start = t0 + delay;
  f.frequency.setValueAtTime(freq, start);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f);
  f.connect(g);
  g.connect(dest);
  src.start(start, Math.random() * 0.5);
  src.stop(start + dur + 0.03);
  return delay + dur;
}

// Notas (Hz) para melodías
const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568, C4: 261.63, G4: 392, A4: 440, E4: 329.63, F4: 349.23 };

// Cada sonido: synth(t0, rate, dest) -> duración en s. maxInstances y minGapMs limitan el spam.
const SOUND_DEFS = {
  eat: { maxInstances: 3, synth: (t, r, d) => synthTone(t, { freq: 620, slideTo: 930, dur: 0.08, type: 'square', gain: 0.1, rate: r, dest: d }) },
  megaFood: {
    maxInstances: 2,
    synth: (t, r, d) => {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => synthTone(t, { freq: f, dur: 0.12, type: 'triangle', gain: 0.22, delay: i * 0.06, rate: r, dest: d }));
      synthNoise(t, { dur: 0.3, gain: 0.06, filter: 'highpass', freq: 6000, delay: 0.1, dest: d });
      return 0.42;
    },
  },
  speed: {
    maxInstances: 2,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.35, gain: 0.18, filter: 'bandpass', freq: 400, freqTo: 3200, q: 3, dest: d });
      return synthTone(t, { freq: 180, slideTo: 720, dur: 0.3, type: 'sawtooth', gain: 0.08, rate: r, dest: d });
    },
  },
  bombSpawn: {
    maxInstances: 2,
    minGapMs: 60,
    synth: (t, r, d) => {
      synthTone(t, { freq: 1900, dur: 0.03, type: 'square', gain: 0.1, rate: r, dest: d });
      return synthTone(t, { freq: 1500, dur: 0.03, type: 'square', gain: 0.08, delay: 0.09, rate: r, dest: d });
    },
  },
  explosion: {
    maxInstances: 3,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.7, gain: 0.55, filter: 'lowpass', freq: 3500, freqTo: 180, dest: d });
      return synthTone(t, { freq: 130, slideTo: 38, dur: 0.55, type: 'sine', gain: 0.5, rate: r, dest: d });
    },
  },
  wallSpawn: {
    maxInstances: 2,
    minGapMs: 80,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.12, gain: 0.2, filter: 'lowpass', freq: 700, dest: d });
      return synthTone(t, { freq: 95, slideTo: 60, dur: 0.16, type: 'square', gain: 0.16, rate: r, dest: d });
    },
  },
  death: {
    maxInstances: 2,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.25, gain: 0.15, filter: 'lowpass', freq: 1500, dest: d });
      return synthTone(t, { freq: 440, slideTo: 90, dur: 0.55, type: 'sawtooth', gain: 0.14, rate: r, dest: d });
    },
  },
  headOn: {
    maxInstances: 1,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.9, gain: 0.6, filter: 'lowpass', freq: 4000, freqTo: 150, dest: d });
      synthTone(t, { freq: 300, slideTo: 60, dur: 0.7, type: 'sawtooth', gain: 0.18, rate: r, dest: d });
      return synthTone(t, { freq: 317, slideTo: 64, dur: 0.7, type: 'sawtooth', gain: 0.18, rate: r, dest: d });
    },
  },
  countBeep: { maxInstances: 1, vary: false, synth: (t, r, d) => synthTone(t, { freq: 660, dur: 0.14, type: 'square', gain: 0.14, dest: d }) },
  go: {
    maxInstances: 1,
    vary: false,
    synth: (t, r, d) => {
      synthTone(t, { freq: 990, dur: 0.4, type: 'square', gain: 0.14, dest: d });
      return synthTone(t, { freq: 1320, dur: 0.4, type: 'triangle', gain: 0.14, delay: 0.04, dest: d });
    },
  },
  themeChange: {
    maxInstances: 1,
    synth: (t, r, d) => {
      synthNoise(t, { dur: 0.5, gain: 0.15, filter: 'bandpass', freq: 250, freqTo: 4500, q: 2, dest: d });
      synthTone(t, { freq: NOTE.C6, dur: 0.3, type: 'sine', gain: 0.15, delay: 0.3, dest: d });
      return synthTone(t, { freq: NOTE.E6, dur: 0.4, type: 'sine', gain: 0.15, delay: 0.42, dest: d });
    },
  },
  victory: {
    maxInstances: 1,
    vary: false,
    synth: (t, r, d) => {
      [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => synthTone(t, { freq: f, dur: 0.14, type: 'square', gain: 0.12, delay: i * 0.12, dest: d }));
      [NOTE.C6, NOTE.E6, NOTE.G6].forEach((f) => synthTone(t, { freq: f / 2, dur: 0.8, type: 'triangle', gain: 0.12, delay: 0.36, dest: d }));
      return synthTone(t, { freq: NOTE.C6, dur: 0.8, type: 'square', gain: 0.1, delay: 0.36, dest: d });
    },
  },
  danceTwinkle: {
    maxInstances: 3,
    synth: (t, r, d) => {
      const notes = [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.A5 * 2, NOTE.D5 * 2];
      return synthTone(t, { freq: notes[Math.floor(Math.random() * notes.length)], dur: 0.25, type: 'sine', gain: 0.07, rate: r, dest: d });
    },
  },
  giftSmall: {
    maxInstances: 3,
    synth: (t, r, d) => {
      synthTone(t, { freq: NOTE.A5, dur: 0.18, type: 'triangle', gain: 0.16, rate: r, dest: d });
      return synthTone(t, { freq: NOTE.E6, dur: 0.22, type: 'triangle', gain: 0.12, delay: 0.06, rate: r, dest: d });
    },
  },
  giftMedium: {
    maxInstances: 3,
    synth: (t, r, d) => {
      [NOTE.E5, NOTE.A5, NOTE.E6].forEach((f, i) => synthTone(t, { freq: f, dur: 0.16, type: 'triangle', gain: 0.18, delay: i * 0.07, rate: r, dest: d }));
      return 0.36;
    },
  },
  giftBig: {
    maxInstances: 2,
    synth: (t, r, d) => {
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6].forEach((f, i) => synthTone(t, { freq: f, dur: 0.18, type: 'square', gain: 0.1, delay: i * 0.07, rate: r, dest: d }));
      synthNoise(t, { dur: 0.5, gain: 0.08, filter: 'highpass', freq: 5000, delay: 0.25, dest: d });
      return 0.75;
    },
  },
  giftEpic: {
    maxInstances: 1,
    vary: false,
    synth: (t, r, d) => {
      synthTone(t, { freq: 90, slideTo: 40, dur: 0.8, type: 'sine', gain: 0.5, dest: d });
      synthNoise(t, { dur: 0.8, gain: 0.3, filter: 'lowpass', freq: 2500, freqTo: 200, dest: d });
      [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f) => synthTone(t, { freq: f, dur: 0.9, type: 'square', gain: 0.08, delay: 0.15, dest: d }));
      [NOTE.C6, NOTE.E6, NOTE.G6].forEach((f) => synthTone(t, { freq: f, dur: 0.9, type: 'square', gain: 0.07, delay: 0.55, dest: d }));
      return 1.5;
    },
  },
  likeGoal: {
    maxInstances: 2,
    synth: (t, r, d) => {
      [NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => synthTone(t, { freq: f, dur: 0.14, type: 'sine', gain: 0.16, delay: i * 0.08, rate: r, dest: d }));
      return 0.5;
    },
  },
  follow: {
    maxInstances: 2,
    synth: (t, r, d) => {
      synthTone(t, { freq: NOTE.G5, dur: 0.16, type: 'triangle', gain: 0.16, rate: r, dest: d });
      return synthTone(t, { freq: NOTE.C6, dur: 0.3, type: 'triangle', gain: 0.16, delay: 0.12, rate: r, dest: d });
    },
  },
  teamJoin: { maxInstances: 1, minGapMs: 300, synth: (t, r, d) => synthTone(t, { freq: 520, slideTo: 800, dur: 0.07, type: 'sine', gain: 0.1, rate: r, dest: d }) },
};

// Sonidos pensados para el botón "probar" del panel
const SOUND_NAMES = Object.keys(SOUND_DEFS);

// ---------- Set kenney (archivos CC0) ----------
async function loadKenneySet() {
  if (audio.kenneyState !== 'idle' || !audio.ctx) return;
  if (!location.protocol.startsWith('http')) {
    audio.kenneyState = 'failed';
    console.warn('[audio] el set kenney necesita el juego servido por HTTP; se usa el procedural');
    return;
  }
  audio.kenneyState = 'loading';
  const names = [...SOUND_NAMES, 'speedHum'];
  await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`${KENNEY_DIR}/${name}.ogg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        audio.buffers[name] = await audio.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) {
        console.warn(`[audio] kenney/${name}.ogg no se pudo cargar (${e.message}); ese sonido usará el procedural`);
      }
    })
  );
  audio.kenneyState = 'ready';
  console.info(`[audio] set kenney listo (${Object.keys(audio.buffers).length} sonidos)`);
}

// Reproduce un efecto. pitch: multiplicador de tono (el combo de comer lo usa).
function playSound(name, { pitch = 1 } = {}) {
  const def = SOUND_DEFS[name];
  if (!def || !audio.ctx || audio.ctx.state !== 'running' || audio.settings.muted) return;
  const now = performance.now();
  if ((audio.active[name] || 0) >= (def.maxInstances || 4)) return;
  if (def.minGapMs && now - (audio.lastAt[name] || 0) < def.minGapMs) return;
  audio.lastAt[name] = now;
  const rate = pitch * (def.vary === false ? 1 : 1 + (Math.random() * 2 - 1) * PITCH_VARIATION);
  audio.active[name] = (audio.active[name] || 0) + 1;
  let duration;
  const buffer = audio.settings.soundSet === 'kenney' ? audio.buffers[name] : null;
  if (buffer) {
    const src = audio.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = audio.ctx.createGain();
    g.gain.value = KENNEY_GAIN;
    src.connect(g);
    g.connect(audio.buses.sfx);
    src.start();
    duration = buffer.duration / rate;
  } else {
    duration = def.synth(audio.ctx.currentTime, rate, audio.buses.sfx);
  }
  setTimeout(() => {
    audio.active[name] = Math.max(0, (audio.active[name] || 1) - 1);
  }, duration * 1000 + 60);
}

// Comer: el tono sube un semitono por comida seguida (hasta una octava); se reinicia tras 2 s sin comer
function playEat(snake) {
  const now = performance.now();
  const combo = audio.eatCombo.get(snake.id);
  const count = combo && now - combo.at < EAT_COMBO_RESET_MS ? Math.min(12, combo.count + 1) : 0;
  audio.eatCombo.set(snake.id, { count, at: now });
  playSound('eat', { pitch: Math.pow(2, count / 12) });
}

// Zumbido suave mientras dura SPEED
function startHum(snake) {
  if (!audio.ctx || audio.hums.has(snake.id)) return;
  const c = audio.ctx;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.2);
  g.connect(audio.buses.sfx);
  const nodes = { g, sources: [] };
  const buffer = audio.settings.soundSet === 'kenney' ? audio.buffers.speedHum : null;
  if (buffer) {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(g);
    src.start();
    g.gain.exponentialRampToValueAtTime(0.25, c.currentTime + 0.2);
    nodes.sources.push(src);
  } else {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = snake.id === 'p1' ? 72 : 81;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 7;
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    osc.connect(lp);
    lp.connect(g);
    osc.start();
    lfo.start();
    nodes.sources.push(osc, lfo);
  }
  audio.hums.set(snake.id, nodes);
}

function stopHum(snakeId) {
  const nodes = audio.hums.get(snakeId);
  if (!nodes) return;
  audio.hums.delete(snakeId);
  const t = audio.ctx.currentTime;
  nodes.g.gain.setTargetAtTime(0.0001, t, 0.08);
  for (const s of nodes.sources) s.stop(t + 0.4);
}

function stopAllHums() {
  for (const id of [...audio.hums.keys()]) stopHum(id);
}

// Brillo en bucle durante la danza
function startDanceLoop() {
  stopDanceLoop();
  audio.danceTimer = setInterval(() => {
    if (state.phase !== 'dancing') return stopDanceLoop();
    playSound('danceTwinkle');
  }, 230);
}

function stopDanceLoop() {
  if (audio.danceTimer) clearInterval(audio.danceTimer);
  audio.danceTimer = null;
}

// ---------- Música de fondo (procedural, opcional, apagada por defecto) ----------
// Progresión suave Am - F - C - G con arpegio; se programa con un poco de antelación.
const MUSIC_CHORDS = [
  [220.0, 261.63, 329.63], // La menor
  [174.61, 220.0, 261.63], // Fa
  [130.81, 164.81, 196.0], // Do
  [196.0, 246.94, 293.66], // Sol
];
const MUSIC_STEP_S = 0.3;

function startMusic() {
  if (audio.music || !audio.ctx) return;
  audio.music = { step: 0, nextTime: audio.ctx.currentTime + 0.1, timer: null };
  audio.music.timer = setInterval(scheduleMusic, 100);
}

function stopMusic() {
  if (!audio.music) return;
  clearInterval(audio.music.timer);
  audio.music = null;
}

function scheduleMusic() {
  const m = audio.music;
  if (!m || audio.ctx.state !== 'running') return;
  while (m.nextTime < audio.ctx.currentTime + 0.4) {
    const chord = MUSIC_CHORDS[Math.floor(m.step / 8) % MUSIC_CHORDS.length];
    const dest = audio.buses.music;
    if (m.step % 8 === 0) chord.forEach((f) => synthTone(m.nextTime, { freq: f, dur: MUSIC_STEP_S * 8, type: 'triangle', gain: 0.05, attack: 0.3, dest }));
    const arp = chord[m.step % 3] * 2;
    synthTone(m.nextTime, { freq: arp, dur: MUSIC_STEP_S * 0.9, type: 'sine', gain: 0.035, attack: 0.02, dest });
    m.nextTime += MUSIC_STEP_S;
    m.step++;
  }
}

function duckMusic(on) {
  audio.ducked = on;
  if (audio.ctx) audio.buses.music.gain.setTargetAtTime(audio.settings.music * (on ? 0.3 : 1), audio.ctx.currentTime, 0.15);
}

// ---------- Voz (speechSynthesis) ----------
// Solo plantillas fijas (nunca lee mensajes del chat), nombres saneados, cola de máx. 3 (se descartan los más viejos).
const VOICE_TEMPLATES = {
  gift: '¡Gracias {name} por {gift}!',
  kill: '¡{name} eliminó a {team}!',
  win: '¡Gana {team}!',
  draw: '¡Empate!',
  epic: '¡Ataque épico de {name}!',
};
const MAX_VOICE_QUEUE = 3;
const VOICE_WATCHDOG_MS = 9000; // Chrome a veces no dispara onend: no dejar la cola atascada
// Nombres de regalos frecuentes en español (TikTok suele mandarlos en inglés)
const GIFT_NAMES_ES = { rose: 'la rosa', tiktok: 'el TikTok', 'finger heart': 'el corazón', doughnut: 'la dona', 'hand hearts': 'los corazones', 'perfume': 'el perfume', lion: 'el león', universe: 'el universo', galaxy: 'la galaxia', 'ice cream cone': 'el helado', 'heart me': 'el corazón' };

const tts = { queue: [], speaking: false, watchdog: null, voice: null, recent: new Map() };

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices();
  for (const lang of audio.settings.voiceLangs) {
    const l = lang.toLowerCase();
    const v = voices.find((x) => x.lang.toLowerCase() === l) || voices.find((x) => x.lang.toLowerCase().startsWith(l));
    if (v) return v;
  }
  return null;
}

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {
    tts.voice = pickVoice();
    if (tts.voice) console.info(`[voz] ${tts.voice.name} (${tts.voice.lang})`);
  };
}

function speakTemplate(key, vars = {}) {
  const template = VOICE_TEMPLATES[key];
  if (!template) return;
  const text = template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
  say(text);
}

function say(text) {
  if (!audio.settings.voice || audio.settings.muted || !('speechSynthesis' in window)) return;
  // La misma frase dos veces seguidas en pocos segundos no aporta (rachas)
  const last = tts.recent.get(text);
  if (last && performance.now() - last < 5000) return;
  tts.recent.set(text, performance.now());
  if (tts.recent.size > 50) tts.recent.clear();
  tts.queue.push(text);
  while (tts.queue.length > MAX_VOICE_QUEUE) tts.queue.shift();
  pumpVoice();
}

function pumpVoice() {
  if (tts.speaking || tts.queue.length === 0) return;
  const text = tts.queue.shift();
  if (!tts.voice) tts.voice = pickVoice();
  const u = new SpeechSynthesisUtterance(text);
  if (tts.voice) u.voice = tts.voice;
  u.lang = tts.voice ? tts.voice.lang : 'es-ES';
  u.volume = Math.min(1, audio.settings.master * audio.settings.tts);
  u.rate = 1.05;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(tts.watchdog);
    tts.speaking = false;
    if (tts.queue.length === 0) duckMusic(false);
    setTimeout(pumpVoice, 150);
  };
  u.onend = finish;
  u.onerror = (e) => {
    if (e.error !== 'interrupted' && e.error !== 'canceled') console.warn(`[voz] error: ${e.error}`);
    finish();
  };
  tts.speaking = true;
  duckMusic(true);
  speechSynthesis.speak(u);
  tts.watchdog = setTimeout(() => {
    speechSynthesis.cancel();
    finish();
  }, VOICE_WATCHDOG_MS);
}

function stopSpeaking() {
  tts.queue = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function spokenGiftName(giftName) {
  const key = String(giftName || '').trim().toLowerCase();
  if (GIFT_NAMES_ES[key]) return GIFT_NAMES_ES[key];
  const clean = cleanText(giftName, 24);
  return clean ? `el ${clean}` : 'el regalo';
}

// ---------- Nombres: filtro de groserías y usuarios bloqueados ----------
// config/name-filter.json (editable). Se aplica igual a lo que se muestra y a lo que se lee.
const BLOCKED_USERS_KEY = 'snakeTikTok.blockedUsers';
let NAME_FILTER = { maxShownLength: 14, maxSpokenLength: 16, bannedWords: [] };
let bannedMatchers = [];
let blockedUsers = new Set();

async function loadNameFilter() {
  const loaded = await loadConfigJson('name-filter.json');
  if (loaded && Array.isArray(loaded.bannedWords)) NAME_FILTER = loaded;
  buildBannedMatchers();
}

// Minúsculas, sin tildes, leetspeak -> letras
function normalizeForFilter(text) {
  const leet = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's' };
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (ch) => leet[ch]);
}

const collapseRepeats = (s) => s.replace(/(.)\1+/g, '$1');

function buildBannedMatchers() {
  bannedMatchers = (NAME_FILTER.bannedWords || []).map((raw) => {
    const substring = raw.endsWith('*');
    const word = normalizeForFilter(raw.replace(/\*$/, '')).replace(/[^a-z]/g, '');
    // Palabras con letras dobles (perra, polla) se comparan sin colapsar repeticiones, para no bloquear "pera"
    const collapse = !/(.)\1/.test(word);
    return { word: collapse ? collapseRepeats(word) : word, collapse, substring: substring || word.length >= 5 };
  });
}

function isNameOffensive(name) {
  const norm = normalizeForFilter(name);
  const letters = norm.replace(/[^a-z]/g, '');
  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  return bannedMatchers.some((m) => {
    if (!m.word) return false;
    const hay = m.collapse ? collapseRepeats(letters) : letters;
    if (m.substring) return hay.includes(m.word);
    return tokens.some((t) => (m.collapse ? collapseRepeats(t) : t) === m.word);
  });
}

// Texto apto para pantalla/voz: sin emojis ni símbolos raros
function cleanText(text, max) {
  const clean = String(text || '').replace(/^@/, '').replace(/[^\p{L}\p{N}._ ]/gu, '').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function loadBlockedUsers() {
  try {
    blockedUsers = new Set((JSON.parse(localStorage.getItem(BLOCKED_USERS_KEY)) || []).map((u) => String(u).toLowerCase()));
  } catch (e) {
    blockedUsers = new Set();
  }
}

function setBlockedUser(user, blocked) {
  const key = String(user || '').replace(/^@/, '').trim().toLowerCase();
  if (!key) return;
  if (blocked) blockedUsers.add(key);
  else blockedUsers.delete(key);
  try {
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify([...blockedUsers]));
  } catch (e) {
    /* sin persistencia */
  }
  console.info(`[filtro] ${key} ${blocked ? 'bloqueado' : 'desbloqueado'}`);
}

const isBlockedUser = (user) => blockedUsers.has(String(user || '').replace(/^@/, '').toLowerCase());

// Nombre para leer en voz alta: sin @, sin símbolos, máx. 16 caracteres; si no pasa el filtro, "alguien"
function spokenName(user) {
  if (isBlockedUser(user)) return 'alguien';
  const clean = cleanText(String(user || '').replace(/[._]+/g, ' '), NAME_FILTER.maxSpokenLength || 16).replace('…', '');
  if (!clean || isNameOffensive(user)) return 'alguien';
  return clean;
}

// Pantalla de "Clic para activar el sonido" (solo si el audio arrancó suspendido)
function drawAudioUnlock() {
  if (!state.audioLocked) return;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawOutlinedText('🔊 Clic para activar el sonido', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, `900 64px ${HUD_FONT}`, '#ffffff', 10);
  ctx.restore();
}

// ---------- Partículas (solo visual, se actualizan a 60 FPS) ----------
function spawnBurst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 120 + Math.random() * 260;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      maxLife: 400 + Math.random() * 400,
      size: 4 + Math.random() * 6,
      color,
    });
  }
}

function updateParticles(dt) {
  const s = dt / 1000;
  for (const p of state.particles) {
    p.life += dt;
    p.x += p.vx * s;
    p.y += p.vy * s;
    p.vx *= 0.94;
    p.vy *= 0.94;
  }
  state.particles = state.particles.filter((p) => p.life < p.maxLife);
}

// ---------- Render ----------

// Grid pre-renderizado una sola vez en un canvas fuera de pantalla (transparente: el fondo va aparte)
const gridLayer = (() => {
  const layer = document.createElement('canvas');
  layer.width = CANVAS_WIDTH;
  layer.height = CANVAS_HEIGHT;
  const g = layer.getContext('2d');
  g.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= COLS; x++) {
    const px = GRID_X + x * CELL + 0.5;
    g.moveTo(px, GRID_Y);
    g.lineTo(px, GRID_Y + ROWS * CELL);
  }
  for (let y = 0; y <= ROWS; y++) {
    const py = GRID_Y + y * CELL + 0.5;
    g.moveTo(GRID_X, py);
    g.lineTo(GRID_X + COLS * CELL, py);
  }
  g.stroke();
  // Borde del área de juego un poco más visible
  g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  g.lineWidth = 2;
  g.strokeRect(GRID_X + 1, GRID_Y + 1, COLS * CELL - 2, ROWS * CELL - 2);
  return layer;
})();

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Puntos (en píxeles) del cuerpo interpolados entre el tick anterior y el actual.
// Cabeza avanza de prev[0] a body[0]; la cola se retrae de prev[último] a prev[penúltimo].
function getSnakePoints(snake, t) {
  const cur = snake.body;
  const prev = snake.prevBody;
  const toPoint = (c) => ({ x: cellCenterX(c.x), y: cellCenterY(c.y) });

  if (!snake.moved) return cur.map(toPoint);

  const points = [];
  points.push({
    x: lerp(cellCenterX(prev[0].x), cellCenterX(cur[0].x), t),
    y: lerp(cellCenterY(prev[0].y), cellCenterY(cur[0].y), t),
  });
  const grew = cur.length > prev.length;
  const lastFixed = grew ? prev.length - 1 : prev.length - 2;
  for (let i = 0; i <= lastFixed; i++) points.push(toPoint(prev[i]));
  if (!grew && prev.length >= 2) {
    const a = prev[prev.length - 1];
    const b = prev[prev.length - 2];
    points.push({
      x: lerp(cellCenterX(a.x), cellCenterX(b.x), t),
      y: lerp(cellCenterY(a.y), cellCenterY(b.y), t),
    });
  }
  return points;
}

function drawFoods(now) {
  for (const f of state.foods) {
    const cx = cellCenterX(f.x);
    const cy = cellCenterY(f.y);
    // Aparece creciendo y luego late suavemente
    const appear = Math.max(0, Math.min(1, (now - f.bornAt) / 250));
    const pulse = 1 + 0.12 * Math.sin(now / 150 + f.x + f.y);
    const r = CELL * 0.36 * pulse * appear;

    ctx.save();
    ctx.shadowColor = '#ff3b5c';
    ctx.shadowBlur = 25;
    ctx.fillStyle = '#ff3b5c';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- Render de items ----------

// Estrella de 5 puntas centrada en (cx, cy)
function traceStar(cx, cy, outer, inner, rotation) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation - Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  ctx.closePath();
}

function drawMegaFood(item, cx, cy, now) {
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffd700';
  traceStar(cx, cy, CELL * 0.5, CELL * 0.22, now / 1000);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff6b0';
  traceStar(cx, cy, CELL * 0.24, CELL * 0.1, now / 1000);
  ctx.fill();
}

function drawBomb(item, cx, cy, now) {
  const def = ITEM_TYPES.BOMB;
  if (item.meta.detonatedAt) {
    // Onda expansiva durante la decoración
    const p = Math.min(1, (now - item.meta.detonatedAt) / def.decorationMs);
    ctx.globalAlpha *= 1 - p;
    ctx.strokeStyle = '#ff6a00';
    ctx.lineWidth = 10 * (1 - p) + 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * (0.4 + 1.6 * p), 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  // Parpadeo rojo: lento normalmente, rápido en los últimos warnMs (aviso de que va a desaparecer)
  const remaining = item.expiresAt - now;
  const period = remaining <= def.warnMs ? 100 : 350;
  const blinkOn = Math.floor(now / period) % 2 === 0;
  if (blinkOn) {
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 35;
    ctx.fillStyle = 'rgba(255, 0, 51, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy + 3, CELL * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  // Bomba teledirigida (de un regalo): mira roja girando alrededor
  if (item.meta.homing) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 51, 85, 0.85)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -now / 30;
    ctx.beginPath();
    ctx.arc(cx, cy + 3, CELL * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  // Cuerpo: siempre con borde rojo y un brillo leve, para que se vea sobre el fondo oscuro aunque no parpadee
  ctx.shadowColor = def.color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#1c1c1c';
  ctx.strokeStyle = blinkOn ? '#ff4d6d' : '#d0002a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy + 3, CELL * 0.33, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Mecha y chispa
  ctx.strokeStyle = '#c8a060';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx + CELL * 0.1, cy - CELL * 0.26);
  ctx.quadraticCurveTo(cx + CELL * 0.2, cy - CELL * 0.45, cx + CELL * 0.32, cy - CELL * 0.4);
  ctx.stroke();
  ctx.fillStyle = Math.floor(now / 80) % 2 === 0 ? '#ffdd33' : '#ff7700';
  ctx.beginPath();
  ctx.arc(cx + CELL * 0.33, cy - CELL * 0.41, 4 + Math.random() * 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpeed(item, cx, cy, now) {
  const pulse = 1 + 0.12 * Math.sin(now / 110);
  const r = CELL * 0.4 * pulse;
  // Líneas de velocidad a la izquierda
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const dy of [-0.18, 0, 0.18]) {
    const offset = ((now / 8) % 12) - 6;
    ctx.moveTo(cx - CELL * 0.75 + offset, cy + CELL * dy);
    ctx.lineTo(cx - CELL * 0.45 + offset, cy + CELL * dy);
  }
  ctx.stroke();
  // Cristal (rombo) con brillo
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 28;
  const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  grad.addColorStop(0, '#e0ffff');
  grad.addColorStop(1, '#00c8ff');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r * 0.65, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.65, cy);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.65, cy);
  ctx.lineTo(cx + r * 0.65, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
}

function drawWall(item, cx, cy) {
  const left = cx - CELL / 2 + 1;
  const top = cy - CELL / 2 + 1;
  const size = CELL - 2;
  ctx.fillStyle = '#888888';
  ctx.fillRect(left, top, size, size);
  // Textura de ladrillo: juntas horizontales y verticales alternadas
  ctx.strokeStyle = '#5c5c5c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let row = 1; row < 3; row++) {
    const y = top + (size * row) / 3;
    ctx.moveTo(left, y);
    ctx.lineTo(left + size, y);
  }
  for (let row = 0; row < 3; row++) {
    const y0 = top + (size * row) / 3;
    const xs = row % 2 === 0 ? [0.5] : [0.25, 0.75];
    for (const fx of xs) {
      ctx.moveTo(left + size * fx, y0);
      ctx.lineTo(left + size * fx, y0 + size / 3);
    }
  }
  ctx.stroke();
  // Esquinas oscuras y borde
  ctx.fillStyle = '#3a3a3a';
  const k = size * 0.14;
  ctx.fillRect(left, top, k, k);
  ctx.fillRect(left + size - k, top, k, k);
  ctx.fillRect(left, top + size - k, k, k);
  ctx.fillRect(left + size - k, top + size - k, k, k);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.strokeRect(left, top, size, size);
}

const ITEM_RENDERERS = { MEGA_FOOD: drawMegaFood, BOMB: drawBomb, SPEED: drawSpeed, WALL: drawWall };

function drawItems(now) {
  for (const item of state.items) {
    const def = ITEM_TYPES[item.type];
    const cx = cellCenterX(item.x);
    const cy = cellCenterY(item.y);
    ctx.save();
    // Aparece creciendo (200 ms)
    const appear = Math.max(0.01, Math.min(1, (now - item.bornAt) / 200));
    ctx.translate(cx, cy);
    ctx.scale(appear, appear);
    ctx.translate(-cx, -cy);
    // Aviso de expiración (menos la bomba, que tiene su propio parpadeo): parpadea en los últimos warnMs
    if (item.type !== 'BOMB' && item.expiresAt !== null && def.warnMs && item.expiresAt - now <= def.warnMs) {
      ctx.globalAlpha = Math.floor(now / 120) % 2 === 0 ? 1 : 0.35;
    }
    ITEM_RENDERERS[item.type](item, cx, cy, now);
    ctx.restore();
    // @usuario del donante encima de los items de regalos grandes (T3+)
    if (item.meta.label && !item.meta.detonatedAt) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawOutlinedText(item.meta.label, cx, cy - CELL * 0.8, `bold 22px ${HUD_FONT}`, item.meta.labelColor || '#ffffff', 5);
      ctx.restore();
    }
  }
}

// Mezcla dos colores #rrggbb (k = 0 -> a, k = 1 -> b)
function mixColor(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(((pa >> shift) & 255) * (1 - k) + ((pb >> shift) & 255) * k);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function drawSnake(snake, t, now) {
  const points = getSnakePoints(snake, t);
  if (points.length === 0) return;

  ctx.save();
  if (!snake.alive && state.dance) {
    // Tras una danza, la serpiente muerta se desvanece a lo largo de los 10 s
    const fade = 1 - (now - state.dance.startedAt) / DANCE_DURATION_MS;
    if (fade <= 0) {
      ctx.restore();
      return;
    }
    ctx.globalAlpha = fade;
  } else if (!snake.alive) {
    // Serpiente muerta: parpadea en rojo
    ctx.globalAlpha = Math.floor(now / 200) % 2 === 0 ? 1 : 0.35;
  }
  // Bailando: el color late entre el suyo y blanco brillante
  const pulse = snake.dancing ? 0.5 + 0.5 * Math.sin(now / 110) : 0;
  const color = !snake.alive ? '#ff3355' : snake.dancing ? mixColor(snake.color, '#ffffff', 0.85 * pulse) : snake.color;
  const inner = !snake.alive ? '#ff9aaa' : snake.dancing ? mixColor(snake.innerColor, '#ffffff', pulse) : snake.innerColor;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

  // Trazo exterior con brillo neón + trazo interior claro. Con SPEED activo, el brillo es cyan e intenso.
  const boosted = snake.alive && snake.tickInterval < TICK_MS;
  ctx.shadowColor = snake.dancing ? GOLD : boosted ? ITEM_TYPES.SPEED.color : color;
  ctx.shadowBlur = snake.dancing ? 30 + 20 * pulse : boosted ? 45 : 24;
  ctx.strokeStyle = color;
  ctx.lineWidth = CELL * 0.95;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = inner;
  ctx.lineWidth = CELL * 0.3;
  ctx.globalAlpha *= 0.6;
  ctx.stroke();
  ctx.globalAlpha /= 0.6;

  // Cabeza
  const head = points[0];
  ctx.fillStyle = !snake.alive ? '#ff5570' : snake.dancing ? mixColor(snake.headColor, '#ffffff', pulse) : snake.headColor;
  ctx.beginPath();
  ctx.arc(head.x, head.y, CELL * 0.55, 0, Math.PI * 2);
  ctx.fill();

  // Ojos orientados según la dirección
  const d = snake.dir;
  const perp = { x: -d.y, y: d.x };
  for (const side of [-1, 1]) {
    const ex = head.x + d.x * 6 + perp.x * 11 * side;
    const ey = head.y + d.y * 6 + perp.y * 11 * side;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(ex + d.x * 2, ey + d.y * 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Bandera de la temática flotando sobre la cabeza, con un leve rebote (solo si está viva)
  if (snake.alive && snake.flagId) {
    const bounce = Math.sin(now / 250) * 4;
    drawFlag(snake.flagId, head.x, head.y - CELL * 1.2 + bounce, CELL * 1.1);
  }
}

// Puntos dorados en los waypoints ya visitados, que se desvanecen poco a poco
function drawDanceTrail(now) {
  if (!state.dance) return;
  ctx.save();
  ctx.fillStyle = GOLD;
  for (const v of state.dance.visited) {
    const alpha = 0.6 * (1 - (now - v.at) / DANCE_TRAIL_FADE_MS);
    if (alpha <= 0) continue;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cellCenterX(v.x), cellCenterY(v.y), CELL * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// "🏆 ¡VICTORIA INMINENTE!" justo debajo del HUD (encima del HUD está la barra de TikTok), con pop de entrada
function drawVictoryBanner(now) {
  const elapsed = now - state.dance.startedAt;
  const p = Math.min(1, elapsed / 450);
  // Entra creciendo con un pequeño rebote (easeOutBack) y luego late suave
  const back = 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;
  const scale = p < 1 ? back : 1 + 0.04 * Math.sin(now / 180);
  const cx = CANVAS_WIDTH / 2;
  const y = GRID_Y + 80;
  ctx.save();
  ctx.globalAlpha = Math.min(1, elapsed / 200);
  ctx.translate(cx, y);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = '🏆 ¡VICTORIA INMINENTE!';
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 25;
  drawOutlinedText(title, 0, 0, fitFont(title, '900', 76, 1020), GOLD, 12);
  ctx.shadowBlur = 0;
  const label = DANCE_PATTERN_LABELS[state.dance.pattern] || state.dance.pattern;
  drawOutlinedText(`baile: ${label}`, 0, 62, `bold 34px ${HUD_FONT}`, '#fff3b0', 6);
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of state.particles) {
    ctx.globalAlpha = 1 - p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.restore();
}

// Texto con contorno oscuro para que se lea sobre el juego y en pantallas pequeñas
function drawOutlinedText(text, x, y, font, fill, strokeWidth) {
  ctx.font = font;
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

const HUD_FONT = '"Segoe UI", Arial, sans-serif';

// ---------- Banderas y skins dibujadas con canvas ----------
// Cada renderer recibe (ctx, x, y, size) y dibuja centrado en (x, y).
// `size` es el ancho; las banderas rectangulares miden size x (size * 2/3), las frutas size x size.

// Grosor de borde que escala con el tamaño (1px de referencia en una bandera de 60px)
const flagBorderWidth = (size, base) => Math.max(1, (base * size) / 60);

function flagBox(x, y, size) {
  const w = size;
  const h = (size * 2) / 3;
  return { left: x - w / 2, top: y - h / 2, w, h };
}

function drawColombiaFlag(ctx, x, y, size) {
  const { left, top, w, h } = flagBox(x, y, size);
  ctx.fillStyle = '#ffcd00';
  ctx.fillRect(left, top, w, h / 2);
  ctx.fillStyle = '#003893';
  ctx.fillRect(left, top + h / 2, w, h / 4);
  ctx.fillStyle = '#ce1126';
  ctx.fillRect(left, top + (h * 3) / 4, w, h / 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = flagBorderWidth(size, 1);
  ctx.strokeRect(left, top, w, h);
}

function drawArgentinaFlag(ctx, x, y, size) {
  const { left, top, w, h } = flagBox(x, y, size);
  ctx.fillStyle = '#75aadb';
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top + h / 3, w, h / 3);
  // Sol de Mayo simplificado
  ctx.fillStyle = '#f6b40e';
  ctx.beginPath();
  ctx.arc(x, y, h * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = flagBorderWidth(size, 1);
  ctx.strokeRect(left, top, w, h);
}

function drawRealFlag(ctx, x, y, size) {
  const { left, top, w, h } = flagBox(x, y, size);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(left, top, w, h);
  // Banda diagonal morada sutil
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, w, h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(90, 42, 130, 0.55)';
  ctx.lineWidth = h * 0.16;
  ctx.beginPath();
  ctx.moveTo(left, top + h);
  ctx.lineTo(left + w, top);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#febe10';
  ctx.lineWidth = flagBorderWidth(size, 2);
  ctx.strokeRect(left, top, w, h);
}

function drawBarcaFlag(ctx, x, y, size) {
  const { left, top, w, h } = flagBox(x, y, size);
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#004d98' : '#a50044';
    // +0.5 para que no queden rendijas entre franjas al escalar
    ctx.fillRect(left + (w * i) / stripes, top, w / stripes + 0.5, h);
  }
  ctx.strokeStyle = '#febe10';
  ctx.lineWidth = flagBorderWidth(size, 1);
  ctx.strokeRect(left, top, w, h);
}

// Tallo y hoja comunes a las frutas
function drawFruitStem(ctx, x, top, size) {
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(x - size * 0.035, top - size * 0.14, size * 0.07, size * 0.2);
  ctx.fillStyle = '#2e9e44';
  ctx.beginPath();
  ctx.ellipse(x + size * 0.11, top - size * 0.06, size * 0.11, size * 0.05, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawApple(ctx, x, y, size) {
  const r = size * 0.4;
  const cy = y + size * 0.06;
  ctx.fillStyle = '#e63946';
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Brillo
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.beginPath();
  ctx.arc(x - r * 0.4, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  drawFruitStem(ctx, x, cy - r, size);
}

function drawOrange(ctx, x, y, size) {
  const r = size * 0.4;
  const cy = y + size * 0.06;
  ctx.fillStyle = '#ff8c00';
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // Gajos: líneas radiales blancas sutiles
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.moveTo(x + Math.cos(a) * r * 0.15, cy + Math.sin(a) * r * 0.15);
    ctx.lineTo(x + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8);
  }
  ctx.stroke();
  drawFruitStem(ctx, x, cy - r, size);
}

const FLAG_RENDERERS = {
  colombia: drawColombiaFlag,
  argentina: drawArgentinaFlag,
  real: drawRealFlag,
  barca: drawBarcaFlag,
  manzana: drawApple,
  naranja: drawOrange,
};

// Dibuja la bandera/skin `flagId` centrada en (x, y). Si no existe, un recuadro gris con "?".
function drawFlag(flagId, x, y, size) {
  ctx.save();
  const renderer = FLAG_RENDERERS[flagId];
  if (renderer) {
    renderer(ctx, x, y, size);
  } else {
    const { left, top, w, h } = flagBox(x, y, size);
    ctx.fillStyle = '#555';
    ctx.fillRect(left, top, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * 0.7)}px ${HUD_FONT}`;
    ctx.fillText('?', x, y);
  }
  ctx.restore();
}

// Línea centrada en cx que mezcla trozos de texto y banderas:
//   { text, weight, size, color }  o  { flagId, size }
// Si no cabe en maxWidth, se escala todo (textos y banderas) por igual.
function drawRichRow(pieces, cx, y, maxWidth, strokeWidth) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const widthOf = (p, k) => {
    if (p.flagId) return p.size * k;
    ctx.font = `${p.weight} ${p.size * k}px ${HUD_FONT}`;
    return ctx.measureText(p.text).width;
  };
  const total = pieces.reduce((sum, p) => sum + widthOf(p, 1), 0);
  const k = Math.min(1, maxWidth / total);
  let x = cx - (total * k) / 2;
  for (const p of pieces) {
    const w = widthOf(p, k);
    if (p.flagId) drawFlag(p.flagId, x + w / 2, y, p.size * k);
    else drawOutlinedText(p.text, x, y, `${p.weight} ${p.size * k}px ${HUD_FONT}`, p.color, strokeWidth);
    x += w;
  }
  ctx.restore();
}

// Fuente cuyo tamaño se reduce lo necesario para que `text` quepa en maxWidth
function fitFont(text, weight, size, maxWidth) {
  ctx.font = `${weight} ${size}px ${HUD_FONT}`;
  const width = ctx.measureText(text).width;
  if (width <= maxWidth) return ctx.font;
  return `${weight} ${Math.floor((size * maxWidth) / width)}px ${HUD_FONT}`;
}

// Dibuja varios trozos de texto (cada uno con su fuente y color) en una línea centrada en cx
function drawTextRow(pieces, cx, y, strokeWidth) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let total = 0;
  for (const p of pieces) {
    ctx.font = p.font;
    p.width = ctx.measureText(p.text).width;
    total += p.width;
  }
  let x = cx - total / 2;
  for (const p of pieces) {
    drawOutlinedText(p.text, x, y, p.font, p.color, strokeWidth);
    x += p.width;
  }
  ctx.restore();
}

// ---------- HUD ----------
// Vive entre HUD_TOP (200) y HUD_BOTTOM (460): debajo de la barra de TikTok Live y encima del grid (480).

function drawHud() {
  if (state.snakes.length === 0) return;
  if (state.mode === 'PVP') drawPvpHud();
  else drawSoloHud();
  if (SETTINGS.showConnectionDot) drawConnectionDot();
}

// Punto discreto arriba a la izquierda del HUD (bajo la barra de TikTok) con el estado de la conexión:
// verde = LIVE de TikTok conectado · amarillo = puente OK pero sin LIVE (mock, esperando live...) · rojo = sin puente
function drawConnectionDot() {
  const s = state.bridgeStatus;
  let color = '#ff3355';
  let label = 'sin puente';
  if (state.bridgeConnected && s) {
    const tiktokState = s.tiktok && s.tiktok.state;
    if (tiktokState === 'connected') {
      color = '#2ee66b';
      label = 'LIVE';
    } else if (s.mode === 'tiktok') {
      color = '#ffc233';
      label = tiktokState === 'ended' ? 'live terminado' : tiktokState === 'error' ? 'error TikTok' : 'esperando live';
    } else {
      color = '#ffc233';
      label = s.mock && s.mock.running ? 'mock' : 'simulador';
    }
  }
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(26, HUD_TOP + 18, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 18px ${HUD_FONT}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fillText(label, 40, HUD_TOP + 18);
  ctx.restore();
}

function drawSoloHud() {
  const snake = state.snakes[0];
  const cx = CANVAS_WIDTH / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawRichRow(
    [
      { flagId: snake.flagId, size: 56 },
      { text: `  ${snake.name}`, weight: 'bold', size: 48, color: snake.color },
    ],
    cx, HUD_TOP + 55, 900, 6
  );
  drawOutlinedText(String(snake.score), cx, HUD_TOP + 140, `900 110px ${HUD_FONT}`, '#ffffff', 10);
  drawOutlinedText(`RÉCORD ${state.bestScore}   ·   RONDA ${state.round}`, cx, HUD_TOP + 225, `bold 32px ${HUD_FONT}`, '#ffd84d', 6);
  ctx.restore();
}

// PvP: título del matchup, una columna por jugador (bandera + nombre, puntos) y el marcador abajo
function drawPvpHud() {
  const [p1, p2] = state.snakes;
  const theme = THEMES[state.roundTheme];
  const stats = getThemeStats(state.roundTheme);
  const cx = CANVAS_WIDTH / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  drawOutlinedText(theme.displayName, cx, HUD_TOP + 36, fitFont(theme.displayName, 'bold', 40, 1000), 'rgba(255,255,255,0.9)', 6);

  // Una columna por jugador: bandera pequeña + nombre, y debajo los puntos grandes
  const columns = [
    { snake: p1, x: CANVAS_WIDTH * 0.25 },
    { snake: p2, x: CANVAS_WIDTH * 0.75 },
  ];
  for (const { snake, x } of columns) {
    drawRichRow(
      [
        { flagId: snake.flagId, size: 40 },
        { text: ` ${snake.name}`, weight: 'bold', size: 40, color: snake.color },
      ],
      x, HUD_TOP + 98, 440, 6
    );
    // TODO: probar 96px en primera transmisión real, evaluar legibilidad en móvil
    drawOutlinedText(String(snake.score), x, HUD_TOP + 160, `900 84px ${HUD_FONT}`, snake.color, 9);
  }
  drawOutlinedText('VS', cx, HUD_TOP + 130, `900 48px ${HUD_FONT}`, 'rgba(255,255,255,0.55)', 6);

  const scoreLine = `MARCADOR: ${p1.name} ${stats.p1Wins} - ${stats.p2Wins} ${p2.name}  ·  EMPATES: ${stats.draws}  ·  RONDA ${state.round}`;
  drawOutlinedText(scoreLine, cx, HUD_TOP + 218, fitFont(scoreLine, 'bold', 26, 1040), 'rgba(255,255,255,0.75)', 5);

  // Espectadores en cada equipo (comando !team en el chat)
  const teams = getTeamCounts();
  drawRichRow(
    [
      { text: 'TEAMS  ', weight: 'bold', size: 26, color: 'rgba(255,255,255,0.6)' },
      { flagId: p1.flagId, size: 30 },
      { text: `  ${teams.p1}  vs  ${teams.p2}  `, weight: 'bold', size: 26, color: '#ffffff' },
      { flagId: p2.flagId, size: 30 },
    ],
    cx, HUD_TOP + 250, 1040, 5
  );
  ctx.restore();
}

// Título de la pantalla de fin de ronda (piezas para drawRichRow) según el modo y el resultado
function getRoundEndTitle() {
  const piece = (text, color) => ({ text, weight: '900', size: 110, color });
  if (state.mode !== 'PVP') {
    const danced = state.roundResult && state.roundResult.danced;
    return danced ? [piece(`¡${state.snakes[0].score} PUNTOS! 🏆`, GOLD)] : [piece('¡CHOCÓ!', '#ff3355')];
  }
  const winner = state.roundResult && state.roundResult.winner;
  if (winner) {
    return [piece('¡GANA ', winner.color), { flagId: winner.flagId, size: 120 }, piece(` ${winner.name}!`, winner.color)];
  }
  return [piece('¡EMPATE! 🤝', '#ffd84d')];
}

function drawCountdown(now) {
  const elapsed = now - state.deathAt;
  const remaining = Math.max(0, RESTART_DELAY_MS - elapsed);
  const number = Math.max(1, Math.ceil(remaining / 1000));
  // Cada número "rebota": empieza grande y se asienta
  const frac = (remaining % 1000) / 1000;
  const scale = 1 + 0.35 * frac * frac;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;
  drawRichRow(getRoundEndTitle(), cx, cy - 260, 1020, 14);
  drawOutlinedText('Siguiente ronda en', cx, cy - 130, `bold 54px ${HUD_FONT}`, '#ffffff', 8);
  const mvp = state.roundResult && state.roundResult.mvp;
  if (mvp) {
    const line = `MVP DE LA RONDA: @${displayHandle(mvp.user)} · ${mvp.diamonds} 💎`;
    drawOutlinedText(line, cx, cy + 300, fitFont(line, '900', 48, 1000), GOLD, 8);
  }
  ctx.translate(cx, cy + 60);
  ctx.scale(scale, scale);
  drawOutlinedText(String(number), 0, 0, `900 260px ${HUD_FONT}`, '#ffffff', 18);
  ctx.restore();
}

// Cartel "PRÓXIMA RONDA: <temática>" con fade in/out; no pausa el juego
function drawThemeBanner(now) {
  const banner = state.themeBanner;
  if (!banner) return;
  const progress = Math.max(0, (now - banner.startedAt) / THEME_BANNER_MS);
  if (progress >= 1) {
    state.themeBanner = null;
    return;
  }
  // Opacidad 0 -> 1 en el primer 20%, 1 en el medio, 1 -> 0 en el último 20%
  const alpha = Math.min(1, progress / 0.2, (1 - progress) / 0.2);
  const theme = THEMES[banner.themeId];
  const cx = CANVAS_WIDTH / 2;
  const cy = CANVAS_HEIGHT / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawOutlinedText('PRÓXIMA RONDA:', cx, cy - 70, `900 80px ${HUD_FONT}`, '#ffd84d', 12);
  drawRichRow(
    [
      { flagId: theme.p1.flagId, size: 90 },
      { text: `  ${theme.displayName}  `, weight: '900', size: 66, color: '#ffffff' },
      { flagId: theme.p2.flagId, size: 90 },
    ],
    cx, cy + 40, 1020, 10
  );
  ctx.restore();
}

function drawFloaters(now) {
  state.floaters = state.floaters.filter((f) => now - f.bornAt < 1200);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of state.floaters) {
    const p = (now - f.bornAt) / 1200;
    ctx.globalAlpha = 1 - p;
    drawOutlinedText(f.text, f.x, f.y - p * 60, `900 40px ${HUD_FONT}`, f.color, 6);
  }
  ctx.restore();
}

// Cartel actual (uno a la vez): franja oscura con texto grande, entra con un pequeño rebote
function drawAnnouncements(now) {
  const a = state.announcements[0];
  if (!a) return;
  if (a.startedAt === null) {
    a.startedAt = now;
    if (a.shakeMs) startShake(a.shakeMs, a.shakePx, now);
  }
  const elapsed = now - a.startedAt;
  if (elapsed > a.durationMs) {
    state.announcements.shift();
    return;
  }
  const p = Math.min(1, elapsed / 250);
  const alpha = Math.min(1, elapsed / 150, (a.durationMs - elapsed) / 300);
  // Durante la pantalla de fin de ronda va debajo del MVP, para no pisar "¡GANA X!"
  const y = state.phase === 'dead' ? CANVAS_HEIGHT / 2 + 430 : GRID_Y + 330;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, y - 80, CANVAS_WIDTH, 160);
  ctx.translate(CANVAS_WIDTH / 2, y);
  const scale = p < 1 ? 0.6 + 0.4 * p + 0.08 * Math.sin(p * Math.PI) : 1;
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawOutlinedText(a.text, 0, 0, fitFont(a.text, '900', 70, 1000), a.color, 12);
  ctx.restore();
}

// Contador de FPS/TPS para verificar el loop (tecla D)
const perf = { frames: 0, ticks: 0, fps: 0, tps: 0, errorsTotal: 0, lastSample: performance.now() };

function drawDebug() {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const bridge = state.bridgeConnected ? 'puente OK' : 'sin puente';
  drawOutlinedText(`render ${perf.fps} fps · lógica ${perf.tps} tps · ${bridge}`, 20, CANVAS_HEIGHT - 70, 'bold 30px monospace', '#00e5ff', 6);
  ctx.restore();
}

function render(now) {
  // Fondo de la temática de la ronda en curso (también es el fondo del HUD)
  ctx.fillStyle = THEMES[state.roundTheme].background || '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  // Temblor de pantalla (ataques épicos, eliminaciones)
  ctx.save();
  if (now < state.shake.until) {
    const k = (state.shake.until - now) / state.shake.duration;
    ctx.translate((Math.random() * 2 - 1) * state.shake.magnitude * k, (Math.random() * 2 - 1) * state.shake.magnitude * k);
  }
  ctx.drawImage(gridLayer, 0, 0);
  drawFoods(now);
  drawItems(now);
  drawDanceTrail(now);
  for (const snake of state.snakes) {
    // Progreso (0..1) entre el movimiento anterior y el siguiente de ESTA serpiente, para interpolar
    const t = isRoundActive() && canMove(snake) ? Math.min(1, snake.moveAccumulator / snake.tickInterval) : 1;
    drawSnake(snake, t, now);
  }
  drawParticles();
  drawHud();
  drawFloaters(now);
  if (state.phase === 'dancing') drawVictoryBanner(now);
  ctx.restore();
  if (state.phase === 'dead') drawCountdown(now);
  drawAnnouncements(now);
  drawThemeBanner(now);
  if (state.debug) drawDebug();
  drawAudioUnlock();
}

// ---------- Loop principal ----------
// Render en cada requestAnimationFrame (~60 FPS); cada serpiente avanza a su ritmo (15/s normal, 22/s con SPEED).
let lastFrameTime = performance.now();
// Errores seguidos en frame(): si pasan de este límite (~1 s a 60 FPS) asumimos estado corrupto y reiniciamos
const MAX_CONSECUTIVE_FRAME_ERRORS = 60;
let consecutiveFrameErrors = 0;

function frame(now) {
  try {
    let dt = now - lastFrameTime;
    lastFrameTime = now;
    // Si la pestaña estuvo pausada, no intentamos "recuperar" cientos de ticks de golpe
    if (dt > 250) dt = 250;

    state.now = now;
    if (isRoundActive()) {
      for (const snake of state.snakes) {
        if (canMove(snake)) snake.moveAccumulator += dt;
      }
      advanceSnakes(now);
      updateRoundStatus(now);
    } else if (now - state.deathAt >= RESTART_DELAY_MS) {
      resetGame(now);
    } else {
      const number = Math.max(1, Math.ceil((RESTART_DELAY_MS - (now - state.deathAt)) / 1000));
      if (number !== state.lastCountdownNumber) {
        state.lastCountdownNumber = number;
        playSound('countBeep');
      }
    }

    processEffectQueue(now, dt);
    updateThemeRotation(now);
    updateParticles(dt);
    render(now);

    perf.frames++;
    if (now - perf.lastSample >= 1000) {
      perf.fps = perf.frames;
      perf.tps = perf.ticks;
      perf.frames = 0;
      perf.ticks = 0;
      perf.lastSample = now;
    }
    consecutiveFrameErrors = 0;
  } catch (err) {
    // Un frame fallido no puede matar el stream, pero el error queda visible en consola
    consecutiveFrameErrors++;
    perf.errorsTotal++;
    console.error(`[frame error] (${consecutiveFrameErrors} seguidos)`, err);
    if (consecutiveFrameErrors > MAX_CONSECUTIVE_FRAME_ERRORS) {
      console.error(`[frame error] más de ${MAX_CONSECUTIVE_FRAME_ERRORS} errores seguidos: reiniciando partida`);
      consecutiveFrameErrors = 0;
      try {
        resetGame(now);
      } catch (resetErr) {
        console.error('[frame error] resetGame() también falló', resetErr);
      }
    }
  } finally {
    // Siempre agendar el siguiente frame, pase lo que pase
    requestAnimationFrame(frame);
  }
}

// Tecla D: mostrar/ocultar FPS (solo para pruebas; el juego no necesita input)
window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') state.debug = !state.debug;
});

// Acceso desde la consola del navegador para pruebas:
//   game.state, game.resetGame(), game.setTheme('real-barca'),
//   game.onChatCommand('usuario', '!theme manzana-naranja'), game.msUntilThemeRotation(),
//   game.spawnItem('BOMB'), game.spawnItem('WALL', 5, 10), game.AI_CONFIG.avoidBombs = false,
//   game.handleTikTokEvent({type: 'chat', user: 'x', message: '!team colombia'}), game.getTeamCounts(),
//   game.triggerVictoryDance(game.state.snakes[0], 'heart')
window.game = {
  state, resetGame, tick, setTheme, onChatCommand, msUntilThemeRotation, spawnItem,
  handleTikTokEvent, registerTeam, getTeamCounts, triggerVictoryDance, checkVictoryInminent, loadGiftMapping,
  get GIFT_MAPPING() { return GIFT_MAPPING; },
  playSound, say, setAudioSettings, spokenName, displayHandle, isNameOffensive, audio,
  THEMES, FLAG_RENDERERS, ITEM_TYPES, AI_CONFIG, DANCE_PATTERNS,
};

loadBlockedUsers();
buildBannedMatchers();
initAudio();
resetGame();
requestAnimationFrame(frame);
loadSettings();
loadNameFilter();
loadGiftMapping();
connectToBridge();
setInterval(reportGameStatus, GAME_STATUS_INTERVAL_MS);

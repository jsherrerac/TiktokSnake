'use strict';

/* =========================================================
   Snake TikTok Live
   - Fase 1: grid 30x53, IA con BFS, auto-restart con countdown.
             Lógica a 15 ticks/s, render a 60 FPS con interpolación.
   - Fase 2: modo PvP (2 serpientes) con rondas ganadas persistentes.
   - Fase 3: temáticas (colores, nombres, banderas dibujadas en canvas), cambio en caliente y rotación automática.
   - Fase 4: items (mega-food, bomba, speed, wall) y velocidad independiente por serpiente.
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
  avoidWalls: true,     // trata los muros como obstáculo
  avoidBombs: true,     // trata las bombas activas como obstáculo
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
    p1: { name: 'COLOMBIA', color: '#ffcd00', innerColor: '#ffe066', headColor: '#fff099', flagId: 'colombia', flagLabel: 'COL' },
    p2: { name: 'ARGENTINA', color: '#75aadb', innerColor: '#a8ccea', headColor: '#c3dbef', flagId: 'argentina', flagLabel: 'ARG' },
    background: '#0a0a15',
  },
  'real-barca': {
    displayName: 'Real Madrid vs Barcelona',
    p1: { name: 'REAL', color: '#ffffff', innerColor: '#f0f0f0', headColor: '#e0e0e0', flagId: 'real', flagLabel: 'RMA' },
    p2: { name: 'BARÇA', color: '#a50044', innerColor: '#c1005a', headColor: '#d81b60', flagId: 'barca', flagLabel: 'FCB' },
    background: '#0a0a15',
  },
  'manzana-naranja': {
    displayName: 'Manzana vs Naranja',
    p1: { name: 'MANZANA', color: '#e63946', innerColor: '#f28b93', headColor: '#f5a5ab', flagId: 'manzana', flagLabel: 'MZN' },
    p2: { name: 'NARANJA', color: '#ff8c00', innerColor: '#ffb04d', headColor: '#ffc370', flagId: 'naranja', flagLabel: 'NRJ' },
    background: '#0a0a15',
  },
};
const DEFAULT_THEME = 'colombia-argentina';
// Cada cuánto rota la temática sola en modo PVP
const THEME_ROTATION_MS = 20 * 60 * 1000;
// Duración del cartel "PRÓXIMA RONDA"
const THEME_BANNER_MS = 2000;

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
  phase: 'playing',   // 'playing' | 'dead'
  snakes: [],
  roundResult: null,  // PvP: { winner: snake } o { winner: null } si fue empate
  stats: loadStats(), // PvP: { [themeId]: { p1Wins, p2Wins, draws } }, persistente
  currentTheme: DEFAULT_THEME,  // temática que se usará en la PRÓXIMA ronda
  roundTheme: DEFAULT_THEME,    // temática de la ronda en curso (la que se ve en pantalla)
  themeBanner: null,            // { themeId, startedAt } mientras se muestra el cartel de cambio
  lastThemeRotationAt: performance.now(),
  foods: [],
  items: [],          // { type, x, y, bornAt, expiresAt, meta }
  activeEffects: [],  // { snakeId, type, until }
  particles: [],
  deathAt: 0,
  roundStartedAt: 0,
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

// Items que la IA trata como pared (según AI_CONFIG)
function isItemObstacleForAI(item) {
  if (item.type === 'WALL') return AI_CONFIG.avoidWalls;
  if (item.type === 'BOMB') return AI_CONFIG.avoidBombs && !item.meta.detonatedAt;
  return false;
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
    if (isItemObstacleForAI(item)) blocked[cellIndex(item.x, item.y)] = 1;
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
    spawnBurst(cellCenterX(next.x), cellCenterY(next.y), '#ff3b5c', 14);
  }

  // Items: se comprueban antes que los choques con cuerpos
  collectItemAt(snake, next, now);
  if (!snake.alive) return;

  // Crecer = no quitar la cola este paso
  if (snake.growPending > 0) snake.growPending--;
  else snake.body.pop();
  snake.moved = true;
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
    killSnake(snake);
    spawnBurst(px, py, def.color, 60);
    console.info(`[item] BOMB mata a ${snake.name} en (${cell.x},${cell.y})`);
  } else if (item.type === 'WALL') {
    killSnake(snake);
    console.info(`[item] WALL mata a ${snake.name} en (${cell.x},${cell.y})`);
  }
}

// Un paso de lógica para el grupo de serpientes `movers` (las que se mueven en este instante)
function stepSnakes(movers, now) {
  expireItems(now);

  // 1) Todas las IA del grupo deciden con el mismo estado del mapa
  for (const snake of movers) {
    snake.dir = decideDirection(snake, movers);
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
  const occupancy = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    for (const c of snake.body) {
      if (inBounds(c.x, c.y)) occupancy[cellIndex(c.x, c.y)]++;
    }
  }
  for (const snake of movers) {
    if (!snake.alive) continue; // ya murió por un item
    const h = snake.body[0];
    if (!inBounds(h.x, h.y) || occupancy[cellIndex(h.x, h.y)] > 1) {
      killSnake(snake);
    }
  }

  // 4) Reponer comida
  refillFoods(now);

  // 5) Fin de ronda: SOLO cuando no queda ninguna viva; PVP cuando queda 1 o ninguna
  const aliveCount = state.snakes.filter((s) => s.alive).length;
  const minAlive = state.mode === 'PVP' ? 1 : 0;
  if (aliveCount <= minAlive) endRound(now);
}

// Mueve a todas las serpientes vivas a la vez (atajo para pruebas desde consola)
function tick(now = performance.now()) {
  stepSnakes(state.snakes.filter((s) => s.alive), now);
}

// Avanza la lógica según el tiempo acumulado de cada serpiente. Primero se mueve la más atrasada;
// las que coinciden (diferencia < 1 ms) se mueven en el mismo paso.
function advanceSnakes(now) {
  for (let guard = 0; guard < 32 && state.phase === 'playing'; guard++) {
    const ready = state.snakes.filter((s) => s.alive && s.moveAccumulator >= s.tickInterval);
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
function spawnItem(type, x, y, now = performance.now()) {
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
    meta: {},
  };
  state.items.push(item);
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
}

function endEffect(effect) {
  const snake = state.snakes.find((s) => s.id === effect.snakeId);
  if (!snake || effect.type !== 'SPEED') return;
  snake.tickInterval = TICK_MS;
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

function killSnake(snake) {
  snake.alive = false;
  // Congelamos la serpiente en su última posición válida (no dentro de la pared)
  snake.body = snake.prevBody;
  snake.moved = false;
  for (const c of snake.body) {
    spawnBurst(cellCenterX(c.x), cellCenterY(c.y), snake.color, 3);
  }
}

function endRound(now) {
  state.phase = 'dead';
  state.deathAt = now;
  for (const snake of state.snakes) {
    if (snake.score > state.bestScore) {
      state.bestScore = snake.score;
      saveBestScore(state.bestScore);
    }
  }

  const seconds = ((now - state.roundStartedAt) / 1000).toFixed(1);
  const scores = state.snakes.map((s) => `${s.name} ${s.score}`).join(' - ');

  if (state.mode === 'PVP') {
    const survivors = state.snakes.filter((s) => s.alive);
    const winner = survivors.length === 1 ? survivors[0] : null;
    state.roundResult = { winner };
    const s = getThemeStats(state.roundTheme);
    if (winner) s[`${winner.id}Wins`]++;
    else s.draws++;
    saveStats(state.stats);
    const [p1, p2] = state.snakes;
    console.info(
      `[ronda ${state.round}] ${winner ? `GANA ${winner.name}` : 'EMPATE'} · puntos ${scores} · ${seconds}s` +
        ` · total ${p1.name} ${s.p1Wins} - ${s.p2Wins} ${p2.name}, empates ${s.draws}`
    );
  } else {
    state.roundResult = null;
    console.info(`[ronda ${state.round}] fin · puntos ${scores} · ${seconds}s`);
  }
}

function resetGame(now = performance.now()) {
  state.mode = MODE;
  state.roundTheme = state.currentTheme; // aquí se aplica un cambio de temática pendiente
  state.round++;
  state.phase = 'playing';
  state.roundResult = null;
  state.roundStartedAt = now;
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

// Placeholder para el puente de TikTok (Fase 5): "!theme real-barca" en el chat cambia la temática.
// El id admite guiones ([\w-]+), porque los ids de temática los llevan.
function onChatCommand(username, message) {
  const match = /^!theme\s+([\w-]+)/i.exec(String(message).trim());
  if (!match) return false;
  const themeId = match[1].toLowerCase();
  console.info(`[chat] ${username} pide temática "${themeId}"`);
  return setTheme(themeId);
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
  }
}

function drawSnake(snake, t, now) {
  const points = getSnakePoints(snake, t);
  if (points.length === 0) return;

  ctx.save();
  // Serpiente muerta: parpadea en rojo durante el countdown
  if (!snake.alive) ctx.globalAlpha = Math.floor(now / 200) % 2 === 0 ? 1 : 0.35;
  const color = snake.alive ? snake.color : '#ff3355';
  const inner = snake.alive ? snake.innerColor : '#ff9aaa';

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);

  // Trazo exterior con brillo neón + trazo interior claro. Con SPEED activo, el brillo es cyan e intenso.
  const boosted = snake.alive && snake.tickInterval < TICK_MS;
  ctx.shadowColor = boosted ? ITEM_TYPES.SPEED.color : color;
  ctx.shadowBlur = boosted ? 45 : 24;
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
  ctx.fillStyle = snake.alive ? snake.headColor : '#ff5570';
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
    drawOutlinedText(String(snake.score), x, HUD_TOP + 170, `900 96px ${HUD_FONT}`, snake.color, 10);
  }
  drawOutlinedText('VS', cx, HUD_TOP + 135, `900 48px ${HUD_FONT}`, 'rgba(255,255,255,0.55)', 6);

  const scoreLine = `MARCADOR: ${p1.name} ${stats.p1Wins} - ${stats.p2Wins} ${p2.name}  ·  EMPATES: ${stats.draws}  ·  RONDA ${state.round}`;
  drawOutlinedText(scoreLine, cx, HUD_TOP + 235, fitFont(scoreLine, 'bold', 28, 1040), 'rgba(255,255,255,0.75)', 5);
  ctx.restore();
}

// Título de la pantalla de fin de ronda (piezas para drawRichRow) según el modo y el resultado
function getRoundEndTitle() {
  const piece = (text, color) => ({ text, weight: '900', size: 110, color });
  if (state.mode !== 'PVP') return [piece('¡CHOCÓ!', '#ff3355')];
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

// Contador de FPS/TPS para verificar el loop (tecla D)
const perf = { frames: 0, ticks: 0, fps: 0, tps: 0, lastSample: performance.now() };

function drawDebug() {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  drawOutlinedText(`render ${perf.fps} fps · lógica ${perf.tps} tps`, 20, CANVAS_HEIGHT - 70, 'bold 34px monospace', '#00e5ff', 6);
  ctx.restore();
}

function render(now) {
  // Fondo de la temática de la ronda en curso (también es el fondo del HUD)
  ctx.fillStyle = THEMES[state.roundTheme].background || '#000000';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.drawImage(gridLayer, 0, 0);
  drawFoods(now);
  drawItems(now);
  for (const snake of state.snakes) {
    // Progreso (0..1) entre el movimiento anterior y el siguiente de ESTA serpiente, para interpolar
    const t = state.phase === 'playing' && snake.alive ? Math.min(1, snake.moveAccumulator / snake.tickInterval) : 1;
    drawSnake(snake, t, now);
  }
  drawParticles();
  drawHud();
  if (state.phase === 'dead') drawCountdown(now);
  drawThemeBanner(now);
  if (state.debug) drawDebug();
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

    if (state.phase === 'playing') {
      for (const snake of state.snakes) {
        if (snake.alive) snake.moveAccumulator += dt;
      }
      advanceSnakes(now);
    } else if (now - state.deathAt >= RESTART_DELAY_MS) {
      resetGame(now);
    }

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
//   game.spawnItem('BOMB'), game.spawnItem('WALL', 5, 10), game.AI_CONFIG.avoidBombs = false
window.game = {
  state, resetGame, tick, setTheme, onChatCommand, msUntilThemeRotation, spawnItem,
  THEMES, FLAG_RENDERERS, ITEM_TYPES, AI_CONFIG,
};

resetGame();
requestAnimationFrame(frame);

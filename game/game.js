'use strict';

/* =========================================================
   Snake TikTok Live
   - Fase 1: grid 30x53, IA con BFS, auto-restart con countdown.
             Lógica a 15 ticks/s, render a 60 FPS con interpolación.
   - Fase 2: modo PvP (2 serpientes) con rondas ganadas persistentes.
   ========================================================= */

// ---------- Modo de juego ----------
// "SOLO" = 1 serpiente | "PVP" = 2 serpientes. Es lo único que hay que cambiar para alternar.
// También se puede cambiar desde la consola: MODE = 'SOLO'; game.resetGame()
let MODE = 'PVP';

// ---------- Configuración general ----------
const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;
const COLS = 30;
const ROWS = 53;
const CELL = 36;
const CELL_COUNT = COLS * ROWS;

// 53 * 36 = 1908px: sobran 12px de alto, así que centramos el grid verticalmente
const GRID_X = 0;
const GRID_Y = Math.floor((CANVAS_HEIGHT - ROWS * CELL) / 2);

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
// Altura del HUD: bajado para no quedar tapado por la UI de TikTok Live (nombre, viewers)
const HUD_Y = 200;
const BEST_SCORE_KEY = 'snakeTikTok.bestScore';
const STATS_KEY = 'snakeTikTok.pvpStats';

// Apariencia y posición inicial de cada jugador
const PLAYER_CONFIGS = {
  p1: { name: 'P1', color: '#1ed760', innerColor: '#8dffb4', headColor: '#5cff95' },
  p2: { name: 'P2', color: '#00bfff', innerColor: '#8be9fd', headColor: '#66d9ff' },
};

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
  stats: loadStats(), // PvP: { p1Wins, p2Wins, draws }, persistente
  foods: [],
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
  const empty = { p1Wins: 0, p2Wins: 0, draws: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem(STATS_KEY));
    return saved ? { ...empty, ...saved } : empty;
  } catch (e) {
    return empty;
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (e) {
    /* sin persistencia, no pasa nada */
  }
}

// ---------- Creación de entidades ----------
function createSnake(id, startX, startY, dir) {
  const config = PLAYER_CONFIGS[id];
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
    growPending: 0,        // segmentos extra por crecer (útil para mega-food en fases siguientes)
    ticksSinceFood: 0,
    name: config.name,
    color: config.color,
    innerColor: config.innerColor,
    headColor: config.headColor,
  };
}

// Devuelve una celda vacía aleatoria (sin serpientes ni comida), o null si el mapa está lleno
function findEmptyCell() {
  const occupied = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    for (const c of snake.body) occupied[cellIndex(c.x, c.y)] = 1;
  }
  for (const f of state.foods) occupied[cellIndex(f.x, f.y)] = 1;

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
  return state.foods.some((f) => Math.abs(f.x - head.x) + Math.abs(f.y - head.y) === 1);
}

// Mapa de obstáculos tal como lo ve `viewer`: todos los cuerpos, propios y ajenos.
// Las colas cuentan como libres si esa serpiente no va a crecer (se moverán en este tick).
// Para un rival no sabemos qué va a decidir: si tiene comida al lado, puede comer y dejar la cola quieta,
// así que en ese caso su cola se trata como bloqueada.
function buildBlockedGrid(viewer) {
  const blocked = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    const len = snake.body.length;
    const mightGrow = snake.growPending > 0 || (snake !== viewer && isHeadNextToFood(snake));
    const tailFree = snake.alive && !mightGrow;
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
function decideDirection(snake) {
  const head = snake.body[0];
  const blocked = buildBlockedGrid(snake);
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

// ---------- Lógica por tick (15 por segundo) ----------
function tick(now) {
  const aliveSnakes = state.snakes.filter((s) => s.alive);

  // 1) Todas las IA deciden con el mismo estado del mapa
  for (const snake of aliveSnakes) {
    snake.dir = decideDirection(snake);
  }

  // 2) Movimiento y comida
  for (const snake of aliveSnakes) {
    snake.prevBody = snake.body.map((c) => ({ x: c.x, y: c.y }));
    const head = snake.body[0];
    const next = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };
    snake.body.unshift(next);
    snake.ticksSinceFood++;

    const foodIdx = state.foods.findIndex((f) => f.x === next.x && f.y === next.y);
    if (foodIdx !== -1) {
      state.foods.splice(foodIdx, 1);
      snake.score++;
      snake.growPending++;
      snake.ticksSinceFood = 0;
      spawnBurst(cellCenterX(next.x), cellCenterY(next.y), '#ff3b5c', 14);
    }

    // Crecer = no quitar la cola este tick
    if (snake.growPending > 0) snake.growPending--;
    else snake.body.pop();
    snake.moved = true;
  }

  // 3) Colisiones: paredes y cualquier cuerpo (propio o ajeno).
  // Se cuenta cuántos segmentos hay en cada celda DESPUÉS de mover a todas. Casos:
  // - Cabeza contra cuerpo ajeno: la celda de la cabeza que pega tiene 2 -> muere solo esa;
  //   la otra cabeza está en una celda con 1 -> sobrevive.
  // - Dos cabezas en la misma celda: esa celda tiene 2 y ambas cabezas están ahí -> mueren las dos.
  // - Cruce de cabezas (se intercambian celdas): cada cabeza cae sobre el cuello de la otra -> mueren las dos.
  const occupancy = new Uint8Array(CELL_COUNT);
  for (const snake of state.snakes) {
    for (const c of snake.body) {
      if (inBounds(c.x, c.y)) occupancy[cellIndex(c.x, c.y)]++;
    }
  }
  for (const snake of aliveSnakes) {
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
    if (winner) state.stats[`${winner.id}Wins`]++;
    else state.stats.draws++;
    saveStats(state.stats);
    const s = state.stats;
    console.info(
      `[ronda ${state.round}] ${winner ? `GANA ${winner.name}` : 'EMPATE'} · puntos ${scores} · ${seconds}s` +
        ` · total P1 ${s.p1Wins} - ${s.p2Wins} P2, empates ${s.draws}`
    );
  } else {
    state.roundResult = null;
    console.info(`[ronda ${state.round}] fin · puntos ${scores} · ${seconds}s`);
  }
}

function resetGame(now = performance.now()) {
  state.mode = MODE;
  state.round++;
  state.phase = 'playing';
  state.roundResult = null;
  state.roundStartedAt = now;
  state.foods = [];
  state.particles = [];
  const midRow = Math.floor(ROWS / 2);
  if (state.mode === 'PVP') {
    // Arrancan encaradas en la fila central
    state.snakes = [
      createSnake('p1', 8, midRow, DIRECTIONS[1]),   // mirando a la derecha
      createSnake('p2', 22, midRow, DIRECTIONS[3]),  // mirando a la izquierda
    ];
  } else {
    state.snakes = [createSnake('p1', Math.floor(COLS / 2), midRow, DIRECTIONS[0])];
  }
  refillFoods(now);
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

// Grid pre-renderizado una sola vez en un canvas fuera de pantalla
const gridLayer = (() => {
  const layer = document.createElement('canvas');
  layer.width = CANVAS_WIDTH;
  layer.height = CANVAS_HEIGHT;
  const g = layer.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
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

  // Trazo exterior con brillo neón + trazo interior claro
  ctx.shadowColor = color;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = color;
  ctx.lineWidth = CELL * 0.82;
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
  ctx.arc(head.x, head.y, CELL * 0.52, 0, Math.PI * 2);
  ctx.fill();

  // Ojos orientados según la dirección
  const d = snake.dir;
  const perp = { x: -d.y, y: d.x };
  for (const side of [-1, 1]) {
    const ex = head.x + d.x * 6 + perp.x * 8 * side;
    const ey = head.y + d.y * 6 + perp.y * 8 * side;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(ex + d.x * 2, ey + d.y * 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }
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

function drawHud() {
  if (state.snakes.length === 0) return;
  if (state.mode === 'PVP') drawPvpHud();
  else drawSoloHud();
}

function drawSoloHud() {
  const snake = state.snakes[0];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = CANVAS_WIDTH / 2;
  drawOutlinedText('PUNTOS', cx, HUD_Y - 95, `bold 44px ${HUD_FONT}`, 'rgba(255,255,255,0.75)', 8);
  drawOutlinedText(String(snake.score), cx, HUD_Y, `900 150px ${HUD_FONT}`, '#ffffff', 14);
  drawOutlinedText(`RÉCORD ${state.bestScore}   ·   RONDA ${state.round}`, cx, HUD_Y + 95, `bold 40px ${HUD_FONT}`, '#ffd84d', 8);
  ctx.restore();
}

// PvP: puntos de cada jugador en su columna y color, marcador de rondas debajo
function drawPvpHud() {
  const [p1, p2] = state.snakes;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const columns = [
    { snake: p1, x: CANVAS_WIDTH * 0.25 },
    { snake: p2, x: CANVAS_WIDTH * 0.75 },
  ];
  for (const { snake, x } of columns) {
    drawOutlinedText(snake.name, x, HUD_Y - 95, `bold 48px ${HUD_FONT}`, snake.color, 8);
    drawOutlinedText(String(snake.score), x, HUD_Y, `900 140px ${HUD_FONT}`, snake.color, 14);
  }
  drawOutlinedText('VS', CANVAS_WIDTH / 2, HUD_Y, `900 56px ${HUD_FONT}`, 'rgba(255,255,255,0.6)', 8);

  const bigFont = `900 50px ${HUD_FONT}`;
  const smallFont = `bold 32px ${HUD_FONT}`;
  drawTextRow(
    [
      { text: p1.name, font: bigFont, color: p1.color },
      { text: `  ${state.stats.p1Wins} - ${state.stats.p2Wins}  `, font: bigFont, color: '#ffffff' },
      { text: p2.name, font: bigFont, color: p2.color },
      { text: `     EMPATES: ${state.stats.draws}`, font: smallFont, color: 'rgba(255,255,255,0.7)' },
    ],
    CANVAS_WIDTH / 2,
    HUD_Y + 100,
    8
  );
  drawOutlinedText(`RÉCORD ${state.bestScore}   ·   RONDA ${state.round}`, CANVAS_WIDTH / 2, HUD_Y + 160, `bold 34px ${HUD_FONT}`, '#ffd84d', 7);
  ctx.restore();
}

// Título de la pantalla de fin de ronda según el modo y el resultado
function getRoundEndTitle() {
  if (state.mode !== 'PVP') return { text: '¡CHOCÓ!', color: '#ff3355' };
  const winner = state.roundResult && state.roundResult.winner;
  if (winner) return { text: `¡GANA ${winner.name}!`, color: winner.color };
  return { text: '¡EMPATE!', color: '#ffd84d' };
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
  const title = getRoundEndTitle();
  drawOutlinedText(title.text, cx, cy - 260, `900 110px ${HUD_FONT}`, title.color, 14);
  drawOutlinedText('Siguiente ronda en', cx, cy - 150, `bold 54px ${HUD_FONT}`, '#ffffff', 8);
  ctx.translate(cx, cy + 40);
  ctx.scale(scale, scale);
  drawOutlinedText(String(number), 0, 0, `900 260px ${HUD_FONT}`, '#ffffff', 18);
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

function render(now, t) {
  ctx.drawImage(gridLayer, 0, 0);
  drawFoods(now);
  for (const snake of state.snakes) drawSnake(snake, t, now);
  drawParticles();
  drawHud();
  if (state.phase === 'dead') drawCountdown(now);
  if (state.debug) drawDebug();
}

// ---------- Loop principal ----------
// Render en cada requestAnimationFrame (~60 FPS); la lógica avanza en pasos fijos de 1/15 s.
let lastFrameTime = performance.now();
let tickAccumulator = 0;
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
      tickAccumulator += dt;
      while (tickAccumulator >= TICK_MS) {
        tickAccumulator -= TICK_MS;
        tick(now);
        perf.ticks++;
          if (state.phase !== 'playing') {
          tickAccumulator = 0;
          break;
        }
      }
    } else if (now - state.deathAt >= RESTART_DELAY_MS) {
      resetGame(now);
      tickAccumulator = 0;
    }

    updateParticles(dt);
    // t = progreso (0..1) entre el tick anterior y el siguiente, para interpolar el movimiento
    const t = state.phase === 'playing' ? Math.min(1, tickAccumulator / TICK_MS) : 1;
    render(now, t);

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
        tickAccumulator = 0;
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

// Acceso desde la consola del navegador para pruebas: window.game.state, window.game.resetGame()
window.game = { state, resetGame, tick };

resetGame();
requestAnimationFrame(frame);

'use strict';

/* Supervisor del puente para operación 24/7:
   - arranca bridge/tiktok-bridge.js (con los mismos argumentos que reciba),
   - lo reinicia si se cae, con backoff de 1 s a 30 s (vuelve a 1 s si estuvo estable más de 1 minuto),
   - guarda todo lo que imprime en logs/bridge-YYYY-MM-DD.log (se borran solos a los 7 días, igual que los de eventos).
   Uso: node bridge/supervisor.js [--mock] */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { ROOT_DIR, localDate } = require('./lib/util');

const BRIDGE = path.join(__dirname, 'tiktok-bridge.js');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const STABLE_MS = 60000;

fs.mkdirSync(LOGS_DIR, { recursive: true });

let backoff = BACKOFF_MIN_MS;
let child = null;
let stopping = false;
let restarts = 0;

function writeLog(line) {
  const stamped = line.startsWith('[') ? line : `[${new Date().toTimeString().slice(0, 8)}] ${line}`;
  console.log(stamped);
  try {
    fs.appendFileSync(path.join(LOGS_DIR, `bridge-${localDate()}.log`), stamped + '\n');
  } catch (e) {
    /* si el disco falla, al menos queda en la consola */
  }
}

function pipeLines(stream) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop();
    lines.filter(Boolean).forEach(writeLog);
  });
}

function start() {
  const startedAt = Date.now();
  writeLog(`[supervisor] arrancando el puente${restarts ? ` (reinicio ${restarts})` : ''}`);
  child = spawn(process.execPath, [BRIDGE, ...process.argv.slice(2)], { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
  pipeLines(child.stdout);
  pipeLines(child.stderr);
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    if (Date.now() - startedAt > STABLE_MS) backoff = BACKOFF_MIN_MS;
    restarts++;
    writeLog(`[supervisor] el puente se cerró (${signal || `código ${code}`}); reinicio en ${backoff / 1000} s`);
    setTimeout(start, backoff);
    backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
  });
}

function shutdown() {
  stopping = true;
  writeLog('[supervisor] cerrando');
  if (child) child.kill();
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
start();

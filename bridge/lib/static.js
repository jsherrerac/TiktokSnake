'use strict';

/* Archivos estáticos: el juego (game/), el panel (bridge/control/), la configuración (config/)
   y los datos generados (data/). Siempre sin caché, para que recargar la config tenga efecto. */

const fs = require('fs');
const path = require('path');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

// Resuelve `relPath` dentro de `baseDir` sin permitir escapar con '..'
function safeJoin(baseDir, relPath) {
  const full = path.resolve(baseDir, '.' + path.posix.normalize('/' + relPath));
  return full === baseDir || full.startsWith(baseDir + path.sep) ? full : null;
}

function sendFile(res, filePath) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// mounts: [{ prefix: '/control', dir: '...', index: 'index.html' }, ...] (se prueba en orden)
function createStaticHandler(mounts) {
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    for (const mount of mounts) {
      if (pathname !== mount.prefix && !pathname.startsWith(mount.prefix === '/' ? '/' : mount.prefix + '/')) continue;
      let rel = pathname.slice(mount.prefix === '/' ? 1 : mount.prefix.length + 1);
      if (rel === '' || rel.endsWith('/')) rel += mount.index || 'index.html';
      const filePath = safeJoin(mount.dir, rel);
      if (!filePath) break;
      sendFile(res, filePath);
      return true;
    }
    return false;
  };
}

module.exports = { createStaticHandler };

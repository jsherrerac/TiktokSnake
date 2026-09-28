'use strict';

/* Modo descubrimiento: guarda lo que llega de TikTok para poder armar el mapeo con datos reales.
   - logs/events-YYYY-MM-DD.jsonl: una línea JSON por evento crudo (con timestamp).
   - data/gift-catalog.json: cada regalo distinto (id, nombre, diamantes, imagen, si es de racha, veces visto).
   - game/assets/gifts/<id>.<ext>: imágenes de los regalos, descargadas una vez.
   - Borra logs de más de LOG_RETENTION_DAYS días. */

const fs = require('fs');
const path = require('path');
const { ROOT_DIR, log, localDate, safeStringify } = require('./util');

const LOG_RETENTION_DAYS = 7;
const MAX_PARALLEL_DOWNLOADS = 4;

class Discovery {
  constructor() {
    this.logsDir = path.join(ROOT_DIR, 'logs');
    this.dataDir = path.join(ROOT_DIR, 'data');
    this.giftsDir = path.join(ROOT_DIR, 'game', 'assets', 'gifts');
    this.catalogPath = path.join(this.dataDir, 'gift-catalog.json');
    for (const dir of [this.logsDir, this.dataDir, this.giftsDir]) fs.mkdirSync(dir, { recursive: true });
    this.catalog = this.loadCatalog();
    this.stream = null;
    this.streamDate = null;
    this.saveTimer = null;
    this.downloadQueue = [];
    this.downloading = 0;
    this.pruneOldLogs();
    setInterval(() => this.pruneOldLogs(), 6 * 3600 * 1000).unref();
  }

  loadCatalog() {
    try {
      return JSON.parse(fs.readFileSync(this.catalogPath, 'utf8'));
    } catch (e) {
      return { updatedAt: null, gifts: {} };
    }
  }

  // Un evento crudo de TikTok -> una línea en el log del día
  logEvent(eventName, data) {
    const today = localDate();
    if (this.streamDate !== today) {
      if (this.stream) this.stream.end();
      this.stream = fs.createWriteStream(path.join(this.logsDir, `events-${today}.jsonl`), { flags: 'a' });
      this.streamDate = today;
    }
    try {
      this.stream.write(safeStringify({ ts: new Date().toISOString(), event: eventName, data }) + '\n');
    } catch (e) {
      log('descubrimiento', `no se pudo registrar ${eventName}: ${e.message}`);
    }
  }

  // Registra un regalo visto en el live (o de la lista del live, con seen = false)
  recordGift({ id, name, diamonds, imageUrl, streakable }, seen = true) {
    if (id === undefined || id === null || id === '') return;
    const key = String(id);
    const now = new Date().toISOString();
    const prev = this.catalog.gifts[key];
    const entry = {
      id: Number(key) || key,
      name: name || (prev && prev.name) || null,
      diamonds: Number.isFinite(diamonds) ? diamonds : prev ? prev.diamonds : null,
      imageUrl: imageUrl || (prev && prev.imageUrl) || null,
      localImage: prev ? prev.localImage : null,
      streakable: streakable ?? (prev ? prev.streakable : null),
      timesSeen: (prev ? prev.timesSeen : 0) + (seen ? 1 : 0),
      firstSeen: prev && prev.firstSeen ? prev.firstSeen : seen ? now : null,
      lastSeen: seen ? now : prev ? prev.lastSeen : null,
    };
    const isNew = !prev;
    this.catalog.gifts[key] = entry;
    if (isNew && seen) log('descubrimiento', `regalo nuevo en el catálogo: ${entry.name} (id ${key}, ${entry.diamonds} diamantes)`);
    if (entry.imageUrl && !entry.localImage) this.queueImage(key, entry.imageUrl);
    this.scheduleSave();
  }

  // Lista completa de regalos del live (fetchAvailableGifts). Acepta snake_case o camelCase.
  mergeGiftList(list) {
    let count = 0;
    for (const g of list || []) {
      const image = g.image || g.icon || {};
      const urls = image.url_list || image.urlList || [];
      this.recordGift(
        {
          id: g.id,
          name: g.name,
          diamonds: Number(g.diamond_count ?? g.diamondCount),
          imageUrl: urls[0],
          streakable: g.type === 1 || g.combo === true,
        },
        false
      );
      count++;
    }
    log('descubrimiento', `lista de regalos del live: ${count} regalos al catálogo`);
  }

  scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.catalog.updatedAt = new Date().toISOString();
      fs.writeFile(this.catalogPath, JSON.stringify(this.catalog, null, 2), (err) => {
        if (err) log('descubrimiento', `no se pudo guardar el catálogo: ${err.message}`);
      });
    }, 1000);
  }

  queueImage(key, url) {
    if (this.downloadQueue.some((d) => d.key === key)) return;
    this.downloadQueue.push({ key, url });
    this.pumpDownloads();
  }

  pumpDownloads() {
    while (this.downloading < MAX_PARALLEL_DOWNLOADS && this.downloadQueue.length) {
      const { key, url } = this.downloadQueue.shift();
      this.downloading++;
      this.downloadImage(key, url).finally(() => {
        this.downloading--;
        this.pumpDownloads();
      });
    }
  }

  async downloadImage(key, url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('gif') ? 'gif' : 'webp';
      const file = `${key}.${ext}`;
      fs.writeFileSync(path.join(this.giftsDir, file), Buffer.from(await res.arrayBuffer()));
      this.catalog.gifts[key].localImage = `assets/gifts/${file}`;
      this.scheduleSave();
    } catch (e) {
      log('descubrimiento', `no se pudo descargar la imagen del regalo ${key}: ${e.message}`);
    }
  }

  pruneOldLogs() {
    const limit = Date.now() - LOG_RETENTION_DAYS * 24 * 3600 * 1000;
    for (const file of fs.readdirSync(this.logsDir)) {
      const full = path.join(this.logsDir, file);
      try {
        if (fs.statSync(full).mtimeMs < limit) {
          fs.unlinkSync(full);
          log('descubrimiento', `log viejo borrado: ${file}`);
        }
      } catch (e) {
        /* archivo en uso o ya borrado */
      }
    }
  }
}

module.exports = { Discovery };

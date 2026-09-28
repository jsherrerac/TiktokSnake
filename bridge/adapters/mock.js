'use strict';

/* Adaptador mock: eventos sintéticos cada 3-5 s para probar sin TikTok.
   Al activarse manda una secuencia fija (teams + una Rosa) y luego eventos aleatorios,
   incluida alguna racha de regalos para ejercitar las rachas incrementales. */

const MIN_DELAY_MS = 3000;
const MAX_DELAY_MS = 5000;

const USERS = ['ana_gamer', 'pipe_col', 'lu.arg', 'snakefan99', 'maria_123', 'juanito', 'la_profe', 'dj_tito'];
// La Rosa (5655) es el id real del spec; el resto son ids de ejemplo hasta tener el catálogo real
const GIFTS = [
  { giftId: 5655, giftName: 'Rose', diamondCount: 1, streakable: true },
  { giftId: 5269, giftName: 'TikTok', diamondCount: 1, streakable: true },
  { giftId: 5487, giftName: 'Finger Heart', diamondCount: 5, streakable: true },
  { giftId: 5879, giftName: 'Doughnut', diamondCount: 30, streakable: false },
  { giftId: 6064, giftName: 'Hand Hearts', diamondCount: 100, streakable: false },
];
const CHAT = ['colombia', 'argentina', 'hola!!', 'vamos verde', 'jajaja', '!team col', 'que buena partida', 'arg', 'dale colombia'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

class MockAdapter {
  constructor(ctx) {
    this.ctx = ctx;
    this.name = 'mock';
    this.timer = null;
    this.enabled = false;
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.ctx.log('mock', 'mock automático ACTIVADO');
    const script = [
      { type: 'chat', user: 'test1', message: '!team colombia' },
      { type: 'gift', user: 'test2', giftId: 5655, giftName: 'Rose', diamondCount: 1, repeatCount: 1 },
      { type: 'chat', user: 'test3', message: '!team argentina' },
    ];
    script.forEach((event, i) => setTimeout(() => this.enabled && this.ctx.emit({ ...event, source: 'mock' }), 800 + i * 700));
    this.timer = setTimeout(() => this.loop(), 800 + script.length * 700);
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    clearTimeout(this.timer);
    this.ctx.log('mock', 'mock automático DESACTIVADO');
  }

  loop() {
    if (!this.enabled) return;
    this.emitRandom();
    this.timer = setTimeout(() => this.loop(), MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  }

  emitRandom() {
    const user = pick(USERS);
    const r = Math.random();
    if (r < 0.35) return this.ctx.emit({ type: 'like', user, likeCount: 1 + Math.floor(Math.random() * 15), source: 'mock' });
    if (r < 0.6) return this.ctx.emit({ type: 'chat', user, message: pick(CHAT), source: 'mock' });
    if (r < 0.8) {
      const gift = pick(GIFTS);
      const count = gift.streakable && Math.random() < 0.4 ? 2 + Math.floor(Math.random() * 5) : 1;
      return this.emitStreak(user, gift, count);
    }
    if (r < 0.9) return this.ctx.emit({ type: 'follow', user, source: 'mock' });
    return this.ctx.emit({ type: 'share', user, source: 'mock' });
  }

  // Racha como la manda TikTok: un evento por incremento y uno final con el total
  emitStreak(user, gift, count) {
    const key = `mock|${user}|${gift.giftId}|${Date.now()}`;
    const { streakable, ...info } = gift;
    if (!streakable || count === 1) {
      this.ctx.emit({ type: 'gift', user, ...info, source: 'mock', streak: { key, total: 1, end: true, streakable: false } });
      return;
    }
    for (let i = 1; i <= count; i++) {
      setTimeout(() => this.ctx.emit({ type: 'gift', user, ...info, source: 'mock', streak: { key, total: i, end: false, streakable } }), (i - 1) * 250);
    }
    setTimeout(() => this.ctx.emit({ type: 'gift', user, ...info, source: 'mock', streak: { key, total: count, end: true, streakable } }), count * 250);
  }
}

module.exports = { MockAdapter };

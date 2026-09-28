'use strict';

/* Adaptador simulador: eventos manuales enviados desde el panel de control (o desde la terminal).
   Un regalo con racha N se manda como lo haría TikTok (N eventos con el acumulado + el final),
   así las rachas incrementales se prueban igual que en real. */

const STREAK_STEP_MS = 200;

class SimulatorAdapter {
  constructor(ctx) {
    this.ctx = ctx;
    this.name = 'simulator';
  }

  // event: { type, user, ... } ; para regalos, streak = cantidad en racha (1 = regalo suelto)
  inject(event) {
    const base = { user: event.user || 'simulador', ...event, source: 'simulator' };
    if (base.type !== 'gift') {
      this.ctx.emit(base);
      return;
    }
    // Completar datos del regalo desde el catálogo si viene solo el id
    const known = base.giftId !== undefined ? this.ctx.discovery.catalog.gifts[String(base.giftId)] : null;
    const gift = {
      ...base,
      giftName: base.giftName || (known && known.name) || 'Regalo',
      diamondCount: Number(base.diamondCount ?? (known && known.diamonds) ?? 1),
      giftImageUrl: base.giftImageUrl || (known && (known.localImage || known.imageUrl)) || undefined,
    };
    const count = Math.max(1, Math.min(500, Number(base.streak || base.repeatCount) || 1));
    delete gift.streak;
    delete gift.repeatCount;
    const key = `sim|${gift.user}|${gift.giftId || gift.giftName}|${Date.now()}|${Math.random()}`;
    if (count === 1) {
      this.ctx.emit({ ...gift, streak: { key, total: 1, end: true, streakable: false } });
      return;
    }
    // Como TikTok: un evento por incremento (acumulado 1..N) y un evento final aparte que repite el total.
    // El final no debe contar doble.
    for (let i = 1; i <= count; i++) {
      setTimeout(() => this.ctx.emit({ ...gift, streak: { key, total: i, end: false, streakable: true } }), (i - 1) * STREAK_STEP_MS);
    }
    setTimeout(() => this.ctx.emit({ ...gift, streak: { key, total: count, end: true, streakable: true } }), count * STREAK_STEP_MS);
  }
}

module.exports = { SimulatorAdapter };

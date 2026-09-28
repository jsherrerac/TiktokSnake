'use strict';

/* Rachas de regalos INCREMENTALES.
   TikTok manda un evento por cada incremento de una racha (repeatCount acumulado: 1, 2, 3...) y uno final
   con repeatEnd. En vez de esperar al final (segundos de retraso), aplicamos el delta en cada evento:
   el juego recibe un regalo por cada unidad nueva, al instante, y el evento final no vuelve a contar. */

const STALE_STREAK_MS = 60000;

class StreakTracker {
  constructor() {
    this.streaks = new Map(); // key -> { total, at }
  }

  /* raw: evento de regalo normalizado con
       streak: { key, total, end, streakable }
     Devuelve el evento a enviar al juego (repeatCount = unidades NUEVAS) o null si no hay nada nuevo. */
  process(raw) {
    const { streak, ...event } = raw;
    if (!streak || !streak.streakable) {
      return { ...event, repeatCount: Math.max(1, streak ? streak.total || 1 : event.repeatCount || 1) };
    }
    this.cleanup();
    const prev = this.streaks.get(streak.key);
    const prevTotal = prev ? prev.total : 0;
    // Si el acumulado baja, es una racha nueva con la misma clave
    const delta = streak.total >= prevTotal ? streak.total - prevTotal : streak.total;
    if (streak.end) this.streaks.delete(streak.key);
    else this.streaks.set(streak.key, { total: streak.total, at: Date.now() });
    if (delta <= 0) return null; // el evento final repite el total: no cuenta doble
    return { ...event, repeatCount: delta, streakTotal: streak.total, streakEnd: !!streak.end };
  }

  cleanup() {
    const limit = Date.now() - STALE_STREAK_MS;
    for (const [key, s] of this.streaks) if (s.at < limit) this.streaks.delete(key);
  }
}

module.exports = { StreakTracker };

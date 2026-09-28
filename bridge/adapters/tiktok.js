'use strict';

/* Adaptador TikTok LIVE real, con tiktok-live-connector 2.x (API TikTokLiveConnection, módulo ESM).
   - Conecta al live de TIKTOK_USER. Si no está en vivo o se cae, reintenta con backoff 5 s -> 60 s.
   - Nunca pasa a modo mock por su cuenta (meter regalos falsos en un directo real sería peor que nada).
   - Normaliza cada evento al contrato del README y guarda el crudo para el modo descubrimiento.
   - Firma: servidor de Euler Stream (gratis con límites; EULER_SIGN_API_KEY los sube). No usa sesión ni cookies. */

const BACKOFF_MIN_MS = 5000;
const BACKOFF_MAX_MS = 60000;

// @usuario de un User de TikTok (el esquema v3 lo trae como displayId; las versiones viejas, como uniqueId)
function userHandle(u) {
  return (u && (u.uniqueId || u.displayId || u.nickname)) || 'anónimo';
}

function userInfo(u) {
  const avatar = u && (u.avatarThumb || u.avatarMedium);
  return {
    user: userHandle(u),
    nickname: (u && u.nickname) || undefined,
    userId: u && u.id !== undefined ? String(u.id) : undefined,
    profilePictureUrl: avatar && avatar.urlList ? avatar.urlList[0] : undefined,
  };
}

class TikTokAdapter {
  constructor(ctx, { user, signApiKey }) {
    this.ctx = ctx;
    this.name = 'tiktok';
    this.user = user;
    this.signApiKey = signApiKey;
    this.connection = null;
    this.backoffMs = BACKOFF_MIN_MS;
    this.retryTimer = null;
    this.stopped = false;
  }

  async start() {
    let lib;
    try {
      lib = await import('tiktok-live-connector');
    } catch (e) {
      this.ctx.setStatus({ state: 'error', detail: 'tiktok-live-connector no está instalado (cd bridge && npm install)' });
      return false;
    }
    const { TikTokLiveConnection, WebcastEvent } = lib;
    const options = {
      processInitialData: false,      // no reenviar regalos/chat viejos al conectar
      enableExtendedGiftInfo: false,  // la lista de regalos se pide aparte (puede dar 403 y no debe tumbar la conexión)
      fetchRoomInfoOnConnect: true,
    };
    if (this.signApiKey) options.signApiKey = this.signApiKey;
    this.connection = new TikTokLiveConnection(this.user, options);
    this.bindEvents(WebcastEvent);
    this.connect();
    return true;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    if (this.connection) this.connection.disconnect().catch(() => {});
  }

  scheduleRetry(reason, minDelay = 0) {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    const delay = Math.max(this.backoffMs, minDelay);
    this.ctx.log('tiktok', `${reason}. Reintento en ${Math.round(delay / 1000)} s`);
    this.ctx.setStatus({ nextRetryAt: Date.now() + delay });
    this.retryTimer = setTimeout(() => this.connect(), delay);
    this.backoffMs = Math.min(BACKOFF_MAX_MS, this.backoffMs * 2);
  }

  async connect() {
    if (this.stopped) return;
    this.ctx.setStatus({ state: 'connecting', detail: `conectando a @${this.user}`, nextRetryAt: null });
    try {
      const state = await this.connection.connect();
      this.backoffMs = BACKOFF_MIN_MS;
      this.ctx.setStatus({ state: 'connected', detail: `en vivo: @${this.user}`, roomId: String(state.roomId || '') });
      this.ctx.log('tiktok', `conectado al live de @${this.user} (roomId ${state.roomId})`);
      this.fetchGifts();
    } catch (err) {
      const name = (err && err.constructor && err.constructor.name) || 'Error';
      const offline = /offline|isn't online|not live|UserOffline/i.test(`${name} ${err && err.message}`);
      // Límite del servidor de firma: respetar retry-after si viene
      let retryAfterMs = 0;
      const headers = err && (err.headers || (err.response && err.response.headers));
      const retryAfter = headers && (headers['retry-after'] || (headers.get && headers.get('retry-after')));
      if (retryAfter) retryAfterMs = Number(retryAfter) * 1000 || 0;
      this.ctx.setStatus({
        state: offline ? 'offline' : 'error',
        detail: offline ? `@${this.user} no está en vivo` : `${name}: ${String((err && err.message) || err).slice(0, 160)}`,
      });
      this.scheduleRetry(offline ? `@${this.user} no está en vivo` : `no se pudo conectar (${name})`, retryAfterMs);
    }
  }

  async fetchGifts() {
    try {
      const list = await this.connection.fetchAvailableGifts();
      const gifts = Array.isArray(list) ? list : (list && (list.gifts || (list.data && list.data.gifts))) || [];
      this.ctx.discovery.mergeGiftList(gifts);
    } catch (e) {
      this.ctx.log('tiktok', `no se pudo pedir la lista de regalos del live (${e.message}); el catálogo se arma con los regalos que lleguen`);
    }
  }

  bindEvents(WebcastEvent) {
    const c = this.connection;
    const raw = (name) => (data) => this.ctx.discovery.logEvent(name, data);

    c.on(WebcastEvent.GIFT, (data) => {
      raw('gift')(data);
      const gift = data.gift || data.extendedGiftInfo || {};
      const image = gift.image || gift.icon || {};
      const imageUrl = (image.urlList || image.url_list || [])[0];
      const giftId = Number(data.giftId || gift.id) || data.giftId;
      const diamondCount = Number(gift.diamondCount ?? gift.diamond_count ?? 0);
      const streakable = gift.type === 1 || gift.combo === true;
      this.ctx.discovery.recordGift({ id: giftId, name: gift.name, diamonds: diamondCount, imageUrl, streakable });
      const info = userInfo(data.user);
      this.ctx.emit({
        type: 'gift',
        ...info,
        giftId,
        giftName: gift.name || `regalo ${giftId}`,
        diamondCount,
        giftImageUrl: imageUrl,
        streak: {
          key: `${info.userId || info.user}|${giftId}|${data.groupId || ''}`,
          total: Number(data.repeatCount) || 1,
          end: !!data.repeatEnd,
          streakable,
        },
      });
    });

    c.on(WebcastEvent.LIKE, (data) => {
      raw('like')(data);
      this.ctx.emit({ type: 'like', ...userInfo(data.user), likeCount: Number(data.count) || 1, totalLikeCount: Number(data.total) || undefined });
    });

    c.on(WebcastEvent.CHAT, (data) => {
      raw('chat')(data);
      const identity = data.userIdentity || {};
      this.ctx.emit({
        type: 'chat',
        ...userInfo(data.user),
        message: data.content ?? data.comment ?? '',
        isModerator: !!identity.isModeratorOfAnchor,
        isOwner: !!identity.isAnchor || userHandle(data.user).toLowerCase() === this.user.toLowerCase(),
      });
    });

    c.on(WebcastEvent.FOLLOW, (data) => {
      raw('follow')(data);
      this.ctx.emit({ type: 'follow', ...userInfo(data.user) });
    });
    c.on(WebcastEvent.SHARE, (data) => {
      raw('share')(data);
      this.ctx.emit({ type: 'share', ...userInfo(data.user) });
    });
    // Solo al log de descubrimiento (no se mandan al juego todavía)
    c.on(WebcastEvent.SOCIAL, raw('social'));
    c.on(WebcastEvent.MEMBER, raw('member'));
    c.on(WebcastEvent.ROOM_USER, (data) => {
      raw('roomUser')(data);
      this.ctx.setStatus({ viewers: Number(data.viewerCount ?? data.totalUser) || undefined });
    });

    c.on(WebcastEvent.STREAM_END, (data) => {
      raw('streamEnd')(data);
      this.ctx.setStatus({ state: 'ended', detail: 'el live terminó' });
      this.backoffMs = BACKOFF_MIN_MS;
      this.scheduleRetry('el live terminó');
    });
    c.on(WebcastEvent.DISCONNECTED, () => {
      if (this.stopped) return;
      // Tras streamEnd ya hay un reintento programado
      if (this.retryTimer && this.ctx.getStatus().state === 'ended') return;
      this.ctx.setStatus({ state: 'offline', detail: 'desconectado de TikTok' });
      this.scheduleRetry('desconectado de TikTok');
    });
    c.on(WebcastEvent.ERROR, (err) => {
      const info = err && err.info ? err.info : 'error';
      const msg = err && err.exception ? err.exception.message : String(err);
      this.ctx.log('tiktok', `${info}: ${String(msg).slice(0, 200)}`);
    });
  }
}

module.exports = { TikTokAdapter };

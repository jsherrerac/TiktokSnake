'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');

// Carga ROOT/.env en process.env (Node >= 20.12 trae process.loadEnvFile). Las variables ya definidas ganan.
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return false;
  try {
    const before = { ...process.env };
    process.loadEnvFile(envPath);
    for (const [k, v] of Object.entries(before)) process.env[k] = v;
    return true;
  } catch (e) {
    console.error('[env] no se pudo leer .env:', e.message);
    return false;
  }
}

const time = () => new Date().toTimeString().slice(0, 8);
const log = (tag, ...args) => console.log(`[${time()}] [${tag}]`, ...args);

// Fecha local YYYY-MM-DD
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Campos pesados de los mensajes de TikTok que no aportan nada al descubrimiento (animaciones, estilos...)
const BULKY_KEYS = new Set([
  'publicAreaMessageCommon', 'publicAreaCommon', 'badgeList', 'badgeImageList', 'mediaBadgeImageList',
  'lynxExtra', 'giftEffect', 'assetBundle', 'asset', 'textEffect', 'trayInfo', 'monitorInfo', 'monitorExtra',
  'displayTextForAnchor', 'displayTextForAudience', 'displayTextForSender', 'trayDisplayText',
  'flyingMicResources', 'flyingMicResourcesV2', 'interactiveGiftInfo', 'secondaryEffectInfo',
  'commentQualityScores', 'commentLabelScores', 'likeEffect', 'icons', 'specifiedDisplayText',
  'avatarBorder', 'avatarLarge', 'avatarMedium', 'avatarJpg', 'backgroundImage', 'backgroundImageV2',
]);

// JSON que no revienta con BigInt (protobuf usa bigint para int64), ni con binarios, y sin campos pesados
function safeStringify(value) {
  return JSON.stringify(value, (key, v) => {
    if (BULKY_KEYS.has(key)) return undefined;
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Uint8Array) return `<${v.length} bytes>`;
    return v;
  });
}

module.exports = { ROOT_DIR, loadEnv, log, localDate, safeStringify };

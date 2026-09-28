# Snake TikTok Live

Juego de Snake automatizado (IA) pensado para transmitir 24/7 en TikTok Live, en formato vertical 1080x1920.

## Estructura

```
game/            juego (HTML5 Canvas + JS vanilla)
bridge/          servidor local: juego + panel + WebSocket + adaptadores de TikTok
  adapters/      tiktok.js (live real), mock.js (eventos falsos), simulator.js (panel)
  control/       panel de control (/control)
config/          configuración editable sin tocar código (settings.json...)
docs/            RESEARCH.md (investigación), TASKS.md (lista de tareas)
logs/, data/     generados por el puente (no van a git)
```

## Ejecutar

```
cd bridge && npm install        # una vez (instala tiktok-live-connector)
node bridge/tiktok-bridge.js    # desde la raíz del proyecto
```

- Juego: **http://localhost:8080/** · Panel: **http://localhost:8080/control**
- El juego también funciona abriendo `game/index.html` como archivo, pero sin config JSON (Chrome bloquea el `fetch`
  con `file://`). Desde otro servidor (Live Server) usa `?bridge=ws://localhost:8080`.

Para transmitir: en OBS / TikTok LIVE Studio, fuente de página web/Link con `http://localhost:8080/` a 1080x1920
(detalles en `docs/RESEARCH.md`).

- Modo: cambia `let MODE = 'PVP'` (o `'SOLO'`) al inicio de `game/game.js`.
- Tecla `D`: muestra/oculta el contador de FPS (render) y TPS (lógica).
- Consola: `game.state` para inspeccionar, `game.resetGame()` para reiniciar.
- Marcador PvP persistente por temática en localStorage (`snakeTikTok.themeStats`). Para ponerlo a cero:
  `localStorage.removeItem('snakeTikTok.themeStats')` y recarga.

### Temáticas

- `game.setTheme('real-barca')`: se aplica en la siguiente ronda (ids: `colombia-argentina`, `real-barca`, `manzana-naranja`).
- En PVP rota sola cada 20 minutos (`THEME_ROTATION_MS`). `game.msUntilThemeRotation()` dice cuánto falta.
- Las banderas se dibujan con canvas (`FLAG_RENDERERS`), porque Chrome en Windows no pinta los emojis de bandera.

### Items

| Item | Efecto | Duración en el mapa |
|---|---|---|
| `MEGA_FOOD` | +5 puntos y crece 3 | hasta que alguien la come |
| `BOMB` | mata a quien la toque | 12 s (parpadea rápido los últimos 3 s) |
| `SPEED` | la serpiente pasa de 15 a 22 movimientos/s durante 5 s | 10 s |
| `WALL` | muro: mata a quien lo toque | 10 s |

- `game.spawnItem('BOMB')` en una celda libre aleatoria, o `game.spawnItem('WALL', x, y)` en una celda concreta
  (x 0-19, y 0-25). También acepta `'mega-food'`, `'bomb'`, etc.
- `game.state.items` y `game.state.activeEffects` muestran lo que hay en juego.
- `game.AI_CONFIG`: qué hace la IA con los items, ajustable en caliente. Busca mega-food y speed.
  Muros y bombas solo los ve a `BOMB_VISION_RADIUS` (3) casillas o menos, y si están pegados a la cabeza
  no reacciona con probabilidad `BOMB_MISS_CHANCE` (0.30). `avoidWalls` / `avoidBombs` a `false` los apaga del todo.

### Victory dance

- **PVP**: cuando una serpiente queda sola, gana la ronda y sigue jugando 3 s. Si entonces tiene 30 puntos o más,
  baila 10 s (espiral, cuadrado, corazón, infinito o zigzag al azar) y luego sale "¡GANA X!"; con menos de 30,
  la ronda se cierra sin danza. Si choca en esos 3 s o durante la danza, gana igual.
- **SOLO**: al llegar a 100 puntos baila y la ronda se cierra con "¡100 PUNTOS! 🏆".
- Consola: `game.triggerVictoryDance(game.state.snakes[0], 'heart')`. Umbrales en `VICTORY_MIN_SCORE`,
  `VICTORY_RIVAL_DEAD_MS` y `DANCE_DURATION_MS`.

### Regalos, likes, follows y shares (`config/gift-mapping.json`)

Todo es editable en el JSON y se recarga desde el panel ("Recargar gift-mapping.json") sin reiniciar.

| Tier (diamantes por unidad) | PVP (con equipo) | SOLO |
|---|---|---|
| T1 (1-4) | comida extra cerca de tu culebra | comida o velocidad |
| T2 (5-29) | velocidad para tu culebra | un muro |
| T3 (30-99) | muro de 3 delante del rival | 3 bombas |
| T4 (100-499) | bomba teledirigida al rival (su IA no la ve) | CAOS |
| T5 (500+) | ATAQUE ÉPICO: 3 bombas teledirigidas + 3 comidas + cartel y temblor | CAOS épico |

- Sin equipo en PVP: T1-T2 dan comida en el centro; T3+ hacen el efecto de SOLO.
- Una racha de N regalos = N efectos. `overrides` fuerza un tier por id o nombre de regalo.
- Likes (PVP): cada 300 likes de un equipo, comida para su culebra; cada 1000 likes totales, lluvia de comida.
  SOLO: cada 100 likes, una comida. Follow: comida en el centro y aviso de agradecimiento. Share: velocidad.
- **Cola**: T5 primero, máximo `maxEffectsPerSecond` efectos por segundo; espera durante la cuenta atrás y la danza.
  **Topes** por tipo de item (`caps`); lo que no cabe se convierte en puntos (`overflowPoints`). Nada se pierde en silencio.
- **Equipos**: "!team colombia" o simplemente escribir "colombia", "col", "dale arg" (si el mensaje empieza por el
  equipo, o tiene 3 palabras o menos y nombra un solo equipo). `!theme` solo dueño y moderadores
  (`chatThemeCommand` en `config/settings.json`: `mods` · `all` · `off`).
- **Crédito**: los items de regalos T3+ muestran el @usuario; si uno mata a una culebra sale
  "💥 @usuario eliminó a X" (o "¡Fuego amigo!"); al final de la ronda, el MVP (quien más diamantes regaló).

### Audio

- Dos sets de efectos (se cambian desde el panel): **procedural** (por defecto, sintetizado en código, sin archivos) y
  **kenney** (CC0, `game/assets/sfx/kenney/`, licencias en `docs/LICENSES.md`).
- Música de fondo opcional (procedural, apagada por defecto); baja sola cuando habla la voz.
- **Voz** (`speechSynthesis`, voz es-CO → es-MX → es-US): solo plantillas fijas ("¡Gracias ana por la rosa!",
  "¡ana eliminó a Argentina!", "¡Gana Colombia!", "¡Ataque épico de ana!"), desde el tier `voiceMinTier` (T3).
  Nunca lee el chat. Cola de 3 frases como máximo.
- **Nombres**: sin emojis ni símbolos, filtro de groserías editable en `config/name-filter.json` (si no pasa: "alguien").
  Usuarios bloqueados desde el panel: no se muestran ni se leen ("anónimo"), sus regalos funcionan igual.
- Si Chrome arranca sin `--autoplay-policy=no-user-gesture-required`, el juego pide "Clic para activar el sonido".
- Ajustes base en `config/settings.json` ("audio"); lo que se cambia en el panel se guarda en ese Chrome.

## Puente TikTok Live (`bridge/`)

Configuración en `.env` en la raíz (copiar de `.env.example`; `.env` no va a git):

| Variable | Qué es |
|---|---|
| `TIKTOK_USER` | cuenta cuyo LIVE se escucha, sin @ |
| `EULER_SIGN_API_KEY` | opcional: API key del servidor de firma (sube los límites gratuitos) |
| `BRIDGE_MODE` | `auto` (TikTok si hay usuario, si no mock) · `tiktok` · `mock` |
| `BRIDGE_PORT` | puerto (por defecto 8080). Siempre escucha solo en 127.0.0.1 |

- **Un solo servidor** en `127.0.0.1:8080`: el juego (`/`), el panel (`/control`), la config (`/config/...`),
  el catálogo (`/data/gift-catalog.json`), el estado (`/api/status`) y el WebSocket (roles `game` y `control`).
- **Adaptadores** (`bridge/adapters/`): el juego solo conoce el contrato de eventos; otra plataforma sería otro adaptador.
  - `tiktok`: tiktok-live-connector **2.x** (`TikTokLiveConnection`). Si el live no está activo o se cae, reintenta
    con backoff de 5 s a 60 s. Detecta el fin del live. Con `TIKTOK_USER` **nunca** pasa a mock solo.
  - `mock`: eventos falsos cada 3-5 s (se activa/desactiva desde el panel o con `mock on|off` en la terminal).
  - `simulator`: eventos manuales desde el panel o la terminal (`chat test1 !team colombia`, `gift test2 1 5 5655 Rose`
    = 5 rosas en racha, `like test3 100`, `follow x`, `share x`, o un JSON crudo).
- **Modo descubrimiento** (solo TikTok real): cada evento crudo va a `logs/events-YYYY-MM-DD.jsonl` y cada regalo
  distinto a `data/gift-catalog.json` (id, nombre, diamantes, imagen, si es de racha, veces visto); las imágenes se
  cachean en `game/assets/gifts/`. Los logs de más de 7 días se borran solos.
- **Rachas incrementales**: cada evento de una racha se aplica al instante con las unidades nuevas; el evento final
  de TikTok (que repite el total) no cuenta doble.
- **Estado de conexión en el juego**: punto arriba a la izquierda (verde LIVE, amarillo mock/esperando, rojo sin
  puente). Se oculta con `"showConnectionDot": false` en `config/settings.json`.
- Mientras el puente esté apagado, Chrome escribe "WebSocket connection ... failed" en la consola en cada intento.
  **No se puede silenciar desde JS** (lo emite la capa de red del navegador; probado con try/catch +
  `onerror.preventDefault()`, `error` en `window`, un Worker y sondeo con `fetch`). En DevTools: ajustes de la consola >
  "Hide network". En OBS la consola no se ve.

### Contrato de eventos puente -> juego

Eventos de TikTok (llevan `type`); los mensajes del sistema llevan `kind` (`status`, `command`).

```js
{
  type: 'gift' | 'like' | 'follow' | 'share' | 'chat',
  source: 'tiktok' | 'mock' | 'simulator',
  user: string,               // @usuario (sin @)
  nickname?: string,          // nombre visible
  userId?: string,
  profilePictureUrl?: string,
  timestamp: number,          // ms
  // gift
  giftId?: number,            // Rosa = 5655
  giftName?: string,
  diamondCount?: number,      // diamantes POR UNIDAD
  repeatCount?: number,       // unidades NUEVAS en este evento (las rachas llegan en varios eventos)
  streakTotal?: number,       // acumulado de la racha hasta este evento
  streakEnd?: boolean,
  giftImageUrl?: string,
  // like
  likeCount?: number,         // likes de este evento
  totalLikeCount?: number,    // total del live (si TikTok lo manda)
  // chat
  message?: string,
  isModerator?: boolean,      // moderador del live
  isOwner?: boolean,          // dueño de la cuenta
}
```

En el juego, `handleTikTokEvent(event)` recibe cada evento y atiende los comandos de chat:

- `!team <equipo>`: se une a un equipo del matchup en pantalla (`!team colombia`, `!team arg`, `!team barça`...).
  Los teams se vacían al cambiar de temática. El HUD muestra `TEAMS [bandera] X vs Y [bandera]`.
- `!theme <id>`: cambia la temática de la siguiente ronda.

Desde la consola del juego: `game.handleTikTokEvent({type: 'chat', user: 'x', message: '!team colombia'})`,
`game.getTeamCounts()`, `game.state.teams`.

## Estado

- [x] Fase 1: motor base (IA BFS, score, auto-restart)
- [x] Fase 2: modo PvP
- [x] Fase 3: temáticas (banderas en canvas, HUD bajo la barra de TikTok)
- [x] Fase 4: items
- [ ] Fase 5: puente TikTok Live
- [x] Fase 6: victory dance

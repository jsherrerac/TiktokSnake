# Snake TikTok Live

Juego de Snake automatizado (IA) pensado para transmitir 24/7 en TikTok Live, en formato vertical 1080x1920.

## Estructura

```
game/     juego (HTML5 Canvas + JS vanilla)
bridge/   puente TikTok Live -> WebSocket (Fase 5)
```

## Ejecutar el juego

Abre `game/index.html` directamente en Chrome/Edge (no requiere servidor ni build).

Para transmitir: en OBS / TikTok LIVE Studio añade una fuente **Navegador** apuntando al archivo local
`game/index.html` con tamaño 1080x1920.

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
- `game.AI_CONFIG`: qué hace la IA con los items (por defecto esquiva muros y bombas, y busca mega-food y speed).

## Puente TikTok Live (`bridge/`)

```
node bridge/tiktok-bridge.js                         # modo mock (eventos de prueba cada 3-5 s)
TIKTOK_USER=usuario node bridge/tiktok-bridge.js     # live real (requiere: cd bridge && npm install)
```

- Levanta un servidor WebSocket en `ws://localhost:8080`; el juego se conecta solo y reintenta cada 5 s
  si el puente no está o se cae. Chrome escribe "WebSocket connection ... failed" en la consola en cada
  intento fallido: es normal mientras el puente esté apagado.
- **Modo mock**: sin `TIKTOK_USER`, con `--mock`, o si `tiktok-live-connector` no está instalado. Al conectarse
  el juego manda una secuencia fija (`test1: !team colombia`, una Rosa de `test2`, `test3: !team argentina`)
  y luego eventos aleatorios.
- **Con `TIKTOK_USER`**, si la conexión a TikTok falla, reintenta cada 15 s y **no** pasa a mock (para no meter
  regalos falsos en un directo real).
- En la terminal del puente se pueden inyectar eventos a mano: `chat test1 !team colombia`,
  `gift test2 1 5655 Rose`, `like test3 5`, `follow x`, `share x` o un JSON crudo.
- No usa la dependencia `ws`: trae un servidor WebSocket mínimo propio (solo texto), así el mock funciona sin `npm install`.

### Contrato de eventos puente -> juego

Cada mensaje es un JSON:

```js
{
  type: 'gift' | 'like' | 'follow' | 'share' | 'chat',
  user: string,          // uniqueId de TikTok
  timestamp: number,     // ms (Date.now() en el puente)
  diamondCount?: number, // gift: diamantes por unidad
  giftName?: string,     // gift
  giftId?: number,       // gift (Rosa = 5655)
  repeatCount?: number,  // gift: repeticiones en racha (se envía una vez, al terminar la racha)
  likeCount?: number,    // like
  message?: string,      // chat
}
```

En el juego, `handleTikTokEvent(event)` recibe cada evento. Por ahora solo lo registra en consola y atiende
los comandos de chat:

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
- [ ] Fase 6: victory dance

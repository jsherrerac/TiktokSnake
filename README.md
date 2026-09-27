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

## Estado

- [x] Fase 1: motor base (IA BFS, score, auto-restart)
- [x] Fase 2: modo PvP
- [x] Fase 3: temáticas (banderas en canvas, HUD bajo la barra de TikTok)
- [x] Fase 4: items
- [ ] Fase 5: puente TikTok Live
- [ ] Fase 6: victory dance

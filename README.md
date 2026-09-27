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
- Marcador PvP persistente en localStorage (`snakeTikTok.pvpStats`). Para ponerlo a cero:
  `localStorage.removeItem('snakeTikTok.pvpStats')` y recarga.

## Estado

- [x] Fase 1: motor base (IA BFS, score, auto-restart)
- [x] Fase 2: modo PvP
- [ ] Fase 3: temáticas
- [ ] Fase 4: items
- [ ] Fase 5: puente TikTok Live
- [ ] Fase 6: victory dance

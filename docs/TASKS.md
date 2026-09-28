# Lista de tareas: cierre pre-live

Leyenda: `[ ]` pendiente · `[x]` hecho · `[~]` parcial · `[!]` bloqueado (con razón)

## Bloque 0: Investigación → docs/RESEARCH.md
- [x] 0.1 Políticas TikTok LIVE: lives automatizados / sin creador / bucle / no original / estático; duración máxima; música con copyright; qué hacen los juegos que sobreviven; mitigaciones
- [x] 0.2 Qué pega y qué no en lives interactivos (hipótesis PEGA / NO PEGA); cómo eligen equipo los espectadores
- [x] 0.3 Técnico: tiktok-live-connector hoy (versión, API, firma, eventos, rachas, issues); respaldo; zonas que tapa la UI; LIVE Studio (fuente navegador, 1080x1920, audio); Chrome autoplay/speechSynthesis/throttling; voces TTS español
- [x] 0.4 Audio con licencia segura: Kenney CC0, síntesis procedural (ZzFX u otro) con licencia verificada
- [x] Commit "docs: investigacion tiktok live interactivo"

## Bloque 1: Bridge real
- [ ] 1.1 Adaptadores bridge/adapters/{tiktok,mock,simulator}.js + panel /control mínimo
- [ ] 1.2 Servidor único 127.0.0.1:8080: juego por HTTP, /control, WebSocket con roles game/control
- [ ] 1.3 .env (TIKTOK_USER, firma, modo, puerto), .env.example, .gitignore
- [ ] 1.4 Descubrimiento: logs/events-YYYY-MM-DD.jsonl, data/gift-catalog.json, lista de regalos + imágenes en game/assets/gifts/, borrar logs > 7 días
- [ ] 1.5 Rachas incrementales (delta de repeatCount, sin doble conteo)
- [ ] 1.6 Robustez: backoff 5 s → 60 s, fin de live, estado al juego (punto verde/rojo ocultable), nunca mock automático con TIKTOK_USER
- [ ] Commit "bridge: adaptadores, servidor local, descubrimiento, rachas incrementales"

## Bloque 2: Mapeo de regalos + cola
- [ ] 2.1 config/gift-mapping.json (tiers PVP/SOLO, likes, follow, share, overrides), recargable desde el panel
- [ ] 2.2 Equipos sin fricción (alias a secas, reglas anti-falsos positivos); !theme solo dueño/moderadores
- [ ] 2.3 Cola con prioridad y tope por segundo; topes de items por tipo → puntos; nada se pierde; nunca sobre cabeza/ocupada; bombas teledirigidas a ≥ 2
- [ ] 2.4 Crédito al donante: meta en items, @usuario sobre items T3+, "💥 @x eliminó a Y", MVP de la ronda
- [ ] Commit "fase 5: mapeo configurable, cola de eventos, credito al donante"

## Bloque 3: Audio
- [ ] 3.1 AudioManager (buses sfx/music/tts, maestro, mute, control desde el panel)
- [ ] 3.2 Sets "procedural" (default) y "kenney" (descarga CC0) + docs/LICENSES.md
- [ ] 3.3 Todos los sonidos listados (comer con tono creciente, mega, speed + zumbido, bomba, explosión, muro, muerte, choque, 3-2-1-YA, temática, victoria, danza en bucle, tiers, meta likes, follow, unirse a equipo con límite; variación ±5 %; límite de instancias)
- [ ] 3.4 Música opcional OFF, solo CC0, ducking con la voz
- [ ] 3.5 Voz: español, plantillas fijas, tier mínimo, nombres saneados + filtro groserías editable, bloqueados, cola máx 3
- [ ] 3.6 Pantalla "Clic para activar el sonido" solo si hace falta; verificar con flags
- [ ] Commit "audio: sfx procedural + kenney cc0, musica opcional, voz con filtro"

## Bloque 4: Engagement en pantalla
- [ ] 4.1 Overlay de zonas seguras (tecla Z) + captura; propuesta de cambio de grid si hace falta (sin cambiarlo)
- [ ] 4.2 Feed de alertas (máx 3, color de equipo, avatar o inicial); banner T4-T5 + temblor + sonido + voz
- [ ] 4.3 Paneles: instrucciones automáticas desde el mapeo, meta de likes, tira y afloja, top 3 donadores (rotan si no caben)
- [ ] 4.4 Ritmo: intro de ronda 3-2-1 ¡YA!, modo inactivo a los 45 s, cámara lenta 400 ms en la muerte decisiva
- [ ] Commit "engagement: alertas, instrucciones automaticas, metas, ranking, ritmo"

## Bloque 5: Panel y operación 24/7
- [ ] 5.1 Panel completo /control (temática, modo, pausa, saltar, recargar mapeo, audio, simulador, estado, resets, bloqueados)
- [ ] 5.2 Atajos 1/2/3, M, P, N, Z, D, S
- [ ] 5.3 config/schedule.json (bloques de modo, cambio al terminar ronda, desactivable)
- [ ] 5.4 bridge/supervisor.js, start-stream.bat (Chrome modo app, user-data-dir propio, flags), recarga suave cada 6 h, topes de memoria
- [ ] 5.5 docs/RUNBOOK.md para Sebas (arranque, captura en LIVE Studio, energía Windows, checklist, fallos, prueba con el celular)
- [ ] Commit "ops: panel, simulador, programador, supervisor, runbook"

## Bloque 6: QA end-to-end
- [ ] 1 Rosa simulada → efecto + alerta + sonido < 300 ms
- [ ] 2 Racha de 10 rosas → 10 efectos, sin doble conteo
- [ ] 3 Ráfaga 300 regalos / 10 s → fps ≥ 50, cola vacía, topes, nada perdido
- [ ] 4 Likes 0 → 1000 → cada meta una vez
- [ ] 5 T5 → banner + temblor + sonido + voz
- [ ] 6 Bomba T4 mata → aviso + MVP
- [ ] 7 Temática, modo y volumen desde el panel
- [ ] 8 Matar el bridge → desconectado → supervisor revive → reconexión
- [ ] 9 Resistencia 30 min con mock (0 excepciones, heap y fps estables)
- [ ] 10 Captura con overlay de zonas seguras
- [ ] 11 Cambiar tier en el JSON → recargar → instrucciones cambian
- [ ] Commit "qa: pruebas end-to-end"

## Reporte final
- [ ] Riesgos de TikTok primero · tabla de bloques · top 10 hallazgos · QA · decisiones · qué falta para la prueba con el celular

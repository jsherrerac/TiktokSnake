# Investigación: TikTok LIVE interactivo (septiembre 2026)

Investigación con límite de tiempo (~30 min, ~25 fuentes). Cada afirmación lleva su fuente y una marca:

- **CONFIRMADO**: fuente oficial, varias fuentes coinciden, o lo probamos en este PC.
- **PROBABLE**: una sola fuente o inferencia nuestra. Hay que verificarlo.

---

## 0.1 Políticas de TikTok LIVE

### ⚠️ RIESGO PRINCIPAL: LIVE automatizado sin creador presente

- **CONFIRMADO.** Las normas de monetización de LIVE dicen que el contenido *"generated or operated primarily through automated systems, such as AI or other third-party tools, without meaningful creator presence, interaction, or facilitation of the LIVE experience"* no puede monetizarse. Es decir: **sin regalos ni ingresos** si el live es solo el juego corriendo solo.
  Fuentes: [LIVE Monetization Guidelines (TikTok)](https://www.tiktok.com/live/creators/en-US/rules_and_guidance/live_monetization_guidelines) (página oficial; el texto se cita igual en varias fuentes independientes: [sociallyin](https://sociallyin.com/blog/tiktok-live-stream-rules/), [livecade](https://livecade.io/docs/fix-live-restrictions/)).
- **CONFIRMADO.** Las mismas normas marcan como no monetizable el contenido *"largely passive, repetitive, unattended, or lacking meaningful viewer engagement"* y el que *"mechanically and repeatedly solicits viewers to increase Gifts"*. Esto afecta a un cartel automático que repita "manda una rosa" en bucle. Fuentes: [LIVE Monetization Guidelines](https://www.tiktok.com/live/creators/en-US/rules_and_guidance/live_monetization_guidelines) y los resultados de búsqueda que citan ese texto.
- **CONFIRMADO (oficial).** La ayuda de LIVE Studio recomienda que el creador esté *"present and on screen throughout the duration of the LIVE"*, avisa que *"Stepping away from the LIVE for too long may be perceived as a lack of engagement"* y que las imágenes quietas hacen más probable que el live se reconozca como grabado. Fuente: [Community Guidelines for LIVE creators (LIVE Studio Help Center)](https://www.tiktok.com/live/studio/help/article/Before-you-go-LIVE/Community-Guidelines?lang=en).
- **CONFIRMADO.** Los lives con imágenes quietas, diapositivas o bucles se restringen: no se recomiendan en el feed ni en búsqueda durante 10 minutos por cada detección. Fuentes: [TikTok Discover: static image restrictions](https://www.tiktok.com/discover/live-visibility-restricted-for-10-minutes-static-image-and-low-quality), [Seller Center: requisitos de LIVE de calidad](https://seller-us.tiktok.com/university/essay?knowledge_id=4581457528243969&lang=en).
- **PROBABLE.** Las herramientas de juegos para LIVE dicen que los disparadores más comunes de restricción son la falta de creador, parecer una grabación o un bucle, visuales repetitivos y los **paneles de "manda regalos" persistentes y a todo color**. Recomiendan dedicar ~la mitad del encuadre a la cámara del creador, hablar sobre el juego y atenuar los paneles de regalos. Fuente: [Livecade: fix LIVE restrictions](https://livecade.io/docs/fix-live-restrictions/).
- **CONFIRMADO.** La actualización de normas vigente desde el 24/09/2026 mantiene las reglas de LIVE y deja clara la escalera de sanciones: aviso → restricción temporal de funciones → baneo de la cuenta. Fuentes: [Fastlane](https://www.usefastlane.ai/blog/tiktok-community-guidelines), [búsqueda sobre la actualización 2026](https://www.darkroomagency.com/observatory/what-brands-need-to-know-about-tiktok-new-rules-2026).

**Conclusión:** un live 24/7 **sin nadie presente** muy probablemente quedará **sin monetización y con alcance restringido**. El juego no hace inviable el proyecto, pero el formato "juego solo, sin creador" sí va en contra de las reglas. Mitigaciones razonables (de más a menos efectivas):

1. **Creador presente** en las horas de live monetizado: cámara en una parte real del encuadre y voz comentando el juego. El juego pasa a ser el "set" del creador.
2. Lives **por bloques** (por ejemplo 1-3 h con alguien presente) en vez de 24/7 desatendido.
3. Nada de carteles de "manda regalos" repetitivos: instrucciones del juego discretas, que expliquen la mecánica, no que pidan regalos.
4. Contenido original y siempre en movimiento (ya lo es: rondas nuevas, temáticas, danza).
5. El código no depende de TikTok: los adaptadores del puente permiten llevarlo a YouTube o Twitch, donde las reglas de lives automatizados son distintas (no investigado aquí).

### Duración máxima de un LIVE
- **PROBABLE (fuentes contradictorias).** Unas guías dicen que una sesión dura como máximo 60 min y que se puede reiniciar al momento; otras hablan de lives de más de 24 h. Fuentes: [Upstream helpdesk](https://help.upstream.so/en/article/how-long-can-you-live-stream-on-youtube-twitch-tiktok-2026-platform-limits-13lhana/), [sociallyin](https://sociallyin.com/resources/how-long-can-you-go-live-on-tiktok/), [TikRec](https://tikrec.com/blog/how-long-can-a-tiktok-live-last). **Hay que verificarlo en la prueba con el celular.** El puente ya detecta el fin del live y se reconecta cuando vuelve.

### Música con derechos de autor
- **CONFIRMADO.** La música con copyright (incluida la de fondo) puede provocar **silencio del audio, corte del live y, si se repite, pérdida del acceso a LIVE**. Solo usar audio propio o con licencia. Fuentes: [TikTok: actualización de copyright en LIVE](https://www.tiktok.com/en/trending/detail/tiktok-updates-live-stream-copyright-rules), [sociallyin](https://sociallyin.com/blog/tiktok-live-stream-rules/).
- **Cambio en el proyecto:** audio 100 % procedural por defecto; los packs de Kenney son CC0; la música viene apagada por defecto.

### Qué hacen los juegos interactivos que sobreviven
- **PROBABLE.** Las plataformas de juegos para TikTok insisten en que los resultados salen de que el creador juegue con su audiencia, *"not from leaving them on autopilot in the corner"*. Fuente: [búsqueda sobre juegos interactivos](https://livecade.io/), [TikXander](https://www.tikxander.com/en).

---

## 0.2 Qué pega y qué no en lives interactivos

| Hipótesis | Veredicto | Evidencia |
|---|---|---|
| Feedback del regalo en < 1 s | **Se valida** (PROBABLE) | Los juegos se venden por *"the game responds immediately"* y *"see the results instantly on screen"*. [búsqueda juegos interactivos](https://tiklivegames.io/) |
| Nombre del donante en pantalla ligado al efecto | **Se valida** (PROBABLE) | Podio de top donadores y *"compete for the top-donor podium"*; en Marble Race cada espectador es su canica. [Livecade Marble Race](https://livecade.io/games/marble-race/) |
| Rivalidad por equipos / países | **Se valida** (CONFIRMADO, varios productos) | [World Cup Country Battle](https://tiktok-live-games.itch.io/worldcup-tiktok-live-game), [Battle Country Arena](https://sergeyblogerf.itch.io/tiktok-game-battle-country-arena) |
| Meta de likes / medidores compartidos | **Se valida** (PROBABLE) | *"likes build shared meters"* [TeamMedia Games](https://games.teammedia.agency/); objetivos tipo "100 rosas" en [TikFinity](https://tikfinity.zerody.one/tiktok/giftoverlays) |
| Ranking de donadores | **Se valida** (CONFIRMADO) | "Live Top 3 leaderboard" [World Cup Country Battle](https://tiktok-live-games.itch.io/worldcup-tiktok-live-game), overlays de top gifter en [TikFinity](https://tikfinity.zerody.one/tiktok/giftoverlays) |
| Instrucciones visibles de qué hace cada regalo | **Se valida con matiz** (PROBABLE) | *"Live icons show viewers exactly what to send"*, **pero** los paneles de regalos persistentes y llamativos son el disparador de restricción más citado. Instrucciones sí, discretas y rotando. [Livecade](https://livecade.io/docs/fix-live-restrictions/) |
| Eventos épicos para regalos caros | **Se valida** (PROBABLE) | Un regalo grande dispara "Chaos" que sacude toda la pista; el TikTok Universe activa finales para toda la sala. [Livecade Marble Race](https://livecade.io/games/marble-race/), [TeamMedia](https://games.teammedia.agency/) |
| Rondas cortas con final claro | Sin evidencia directa | Marble Race usa un lobby con temporizador y luego la carrera. Inferencia: rondas de 30-90 s. |
| Sonido fuerte y voz en regalos grandes | Sin evidencia directa | TikFinity vende alertas de sonido y TTS como función principal: [TikFinity](https://tikfinity.zerody.one/). |
| NO PEGA: efectos que no se notan (bomba que la IA esquiva) | **Se valida** por la lógica anterior | Nuestro propio dato: con la IA esquivando, una bomba delante mata 1 de cada 12 veces (Fase 4.5). → Bombas teledirigidas que la IA no ve (Bloque 2). |
| NO PEGA: pantalla quieta, bucles | **CONFIRMADO** (es regla) | Ver 0.1. |
| NO PEGA: música con copyright | **CONFIRMADO** (es regla) | Ver 0.1. |
| NO PEGA: cosas tapadas por la UI | PROBABLE | Ver zonas seguras en 0.3. |

**Cómo eligen equipo los espectadores (menos fricción):**
- **CONFIRMADO (varios productos).** Lo más común es **comentar el nombre del país o del equipo** ("Comment their country name to add 1 point"), sin comando. Los regalos suman puntos al equipo del donante. Fuentes: [World Cup Country Battle](https://tiktok-live-games.itch.io/worldcup-tiktok-live-game), [búsqueda de country battle](https://tiktokgames.io/). En Marble Race *cualquier* comentario o like te mete. [Livecade](https://livecade.io/games/marble-race/)
- **Cambio en el proyecto:** unirse escribiendo el nombre o alias a secas ("colombia", "col"), además de `!team`.

---

## 0.3 Técnico

### tiktok-live-connector hoy
- **CONFIRMADO (registro npm, consultado hoy).** Versión estable **2.5.0**, publicada el 16/09/2026. La **1.x está abandonada**: última versión 1.2.3, de enero de 2025. La 2.x es **ESM** (`"type": "module"`) y pide **Node ≥ 20**. También expone `tiktok-live-connector/legacy`. Fuente: `https://registry.npmjs.org/tiktok-live-connector` (consulta directa).
- **CONFIRMADO.** Nueva API: `new TikTokLiveConnection(uniqueId, options)`, `await connection.connect()` (falla si el usuario no está en vivo) y eventos por `WebcastEvent.CHAT / GIFT / LIKE / SOCIAL (→ FOLLOW, SHARE) / MEMBER / ROOM_USER / STREAM_END / CONNECTED / DISCONNECTED / ERROR`. `fetchAvailableGifts()` devuelve la lista de regalos con `id`, `name`, `diamond_count`, y con `enableExtendedGiftInfo` se añaden nombre, costo e imagen a cada regalo. Fuentes: [README de la rama ts-rewrite](https://raw.githubusercontent.com/zerodytrash/TikTok-Live-Connector/ts-rewrite/README.md), [repositorio](https://github.com/zerodytrash/TikTok-Live-Connector).
- **CONFIRMADO.** La conexión necesita una **firma del servidor de Euler Stream**. Hay un nivel gratuito comunitario; una API key (`signApiKey`) sube los límites. El plan gratuito ofrece **2.500 solicitudes/día**. **No hace falta iniciar sesión** para leer eventos; solo para enviar mensajes, lo que además arriesga la cuenta. Fuentes: [README](https://raw.githubusercontent.com/zerodytrash/TikTok-Live-Connector/ts-rewrite/README.md), [Euler Stream pricing](https://www.eulerstream.com/pricing).
- **CONFIRMADO. Rachas:** en los regalos de racha (`giftType === 1`) llega un evento por incremento, con `repeatCount` acumulado, y uno final con `repeatEnd: true`. El README aconseja procesar solo al final; **nosotros aplicaremos el delta en cada evento** para que la respuesta sea inmediata (Bloque 1.5). Fuente: [README ts-rewrite](https://raw.githubusercontent.com/zerodytrash/TikTok-Live-Connector/ts-rewrite/README.md).
- **CONFIRMADO. Cambios recientes:** en 2.5.0 los errores de límite de firma (`SignatureRateLimitError`) traen `retry-after`; en 2.3.0 se desacopló Euler Stream y se añadieron más de 30 eventos. Fuente: [Releases](https://github.com/zerodytrash/TikTok-Live-Connector/releases).
- **CONFIRMADO. Problemas abiertos:** errores de firma 404 (#327, ago 2026), `GIFT` que no se dispara para ciertos usuarios (#316), 403 al pedir la lista de regalos (#310) y mensajes de chat perdidos (#280). → **El catálogo de regalos también se arma con los eventos que llegan**, no solo con `fetchAvailableGifts`. Fuente: [Issues](https://github.com/zerodytrash/TikTok-Live-Connector/issues).
- **PROBABLE.** Los campos exactos de moderador u owner en el chat no están documentados en el README. Se confirmarán con los logs crudos de la prueba con el celular (modo descubrimiento).

### Respaldo si la librería falla (solo documentado)
- **CONFIRMADO.** **TikFinity** ofrece una Event API por WebSocket local, que exige tener su app de escritorio abierta en el mismo PC. Fuente: [TikFinity Event API](https://tikfinity.zerody.one/tiktok/dapi).
- **CONFIRMADO.** **Euler Stream** y **TikTools** ofrecen WebSockets gestionados en la nube que reenvían eventos ya decodificados. Fuentes: [Euler Stream](https://www.eulerstream.com/pricing), [TikTools docs](https://tik.tools/docs/).
- Con los adaptadores del Bloque 1, cualquiera de estas opciones sería un archivo nuevo en `bridge/adapters/`, sin tocar el juego.

### Zonas que tapa la UI de TikTok LIVE (celular, canvas 1080×1920)
- **CONFIRMADO para video, PROBABLE para LIVE.** Las guías de zonas seguras reservan unos **200 px arriba** y **~330-400 px abajo**; márgenes laterales conservadores de 60 px a la izquierda y 180 px a la derecha. Fuentes: [CreaMate](https://creamate.ai/en/blog/tiktok-safe-zone-guide), [Kreatli](https://kreatli.com/guides/tiktok-safe-zone), [CheckSafe.Zone](https://checksafe.zone/articles/tiktok-safe-area-overlay-guide-2026).
- **PROBABLE (inferencia para LIVE, hay que verificar con una captura del celular):**

| Zona | Coordenadas aprox. (x, y, ancho, alto) | Qué hay |
|---|---|---|
| Barra superior | 0, 0, 1080, 200 | Avatar y nombre del host, seguir, espectadores, top donadores, cerrar |
| Banners de regalos | 0, 820, 720, 280 | Combos de regalos que entran por la izquierda sobre el chat |
| Chat | 0, 1150, 760, 570 | Comentarios que suben desde abajo a la izquierda |
| Barra inferior | 0, 1720, 1080, 200 | Caja de comentario, regalo, compartir |
| Lateral derecho | 900, 1300, 180, 420 | Corazones de likes y botones |

- **Consecuencia:** con el HUD entre 200 y 460 y el grid de 480 a 1884, **el tercio inferior izquierdo del mapa (≈ filas 12-25, columnas 0-13) queda bajo el chat y los banners**. No lo cambiamos (regla del prompt); lo proponemos en el reporte.

### TikTok LIVE Studio
- **CONFIRMADO (oficial).** Fuentes disponibles: Game capture, Display capture, **Window capture**, Camera, Capture card, Cast, Text, Video, Image y **Link** ("add a webpage preview to your LIVE"). Fuente: [What's a source? (LIVE Studio Help Center)](https://www.tiktok.com/live/studio/help/article/Get-started-with-your-first-LIVE/Whats-a-source), [Add a capture source](https://www.tiktok.com/live/studio/help/article/Get-started-with-your-first-LIVE/Add-a-capture-source-to-share-your-computer-screen).
- **PROBABLE.** Una guía recomienda capturar la ventana en vez de usar la fuente Link, porque la fuente web consume RAM y puede ir a tirones. Fuente: [tiktokgames.live](https://tiktokgames.live/how-to-add-browser-source-tiktok-studio.html). **Recomendación:** probar primero la fuente Link con `http://localhost:8080/`; si va a tirones, capturar la ventana de Chrome abierta en modo app a 1080×1920.
- **PROBABLE.** Lo vertical tiene más visibilidad en el feed de LIVE. Fuente: [CreaMate](https://creamate.ai/en/blog/tiktok-safe-zone-guide).
- **1080×1920 nítido con un monitor horizontal (inferencia):** la fuente Link renderiza la página al tamaño pedido sin depender del monitor. Con captura de ventana, una ventana de 1080×1920 no cabe en un monitor de 1080 px de alto; la alternativa es **girar un monitor externo a vertical** (Windows: Configuración > Pantalla > Orientación: vertical).
- **Audio:** sin evidencia directa de si la fuente Link captura el audio de la página. Habrá que comprobarlo en la primera prueba de LIVE Studio; si no, capturar el audio del escritorio.

### Chrome: autoplay, voz y throttling
- **CONFIRMADO (oficial + probado aquí).** Un `AudioContext` creado sin gesto del usuario arranca en estado `suspended`. Con el flag `--autoplay-policy=no-user-gesture-required` se desactiva la restricción. Fuente: [Autoplay policy in Chrome](https://developer.chrome.com/blog/autoplay).
- **CONFIRMADO (oficial + probado aquí).** `speechSynthesis.speak()` sin activación del usuario da el error `not-allowed` desde Chrome M71. Fuente: [Intent to Remove (blink-dev)](https://groups.google.com/a/chromium.org/g/blink-dev/c/WsnBm53M4Pc).
- **Prueba en este PC (Chrome, 28/09/2026):**

  | | AudioContext | speechSynthesis |
  |---|---|---|
  | Sin flag | `suspended` | `not-allowed` |
  | Con `--autoplay-policy=no-user-gesture-required` | `running` | funciona |

- **CONFIRMADO (varias fuentes + probado aquí en fases anteriores).** Una ventana tapada por otra se considera oculta y `requestAnimationFrame` cae a 0 fps. Lo evitan `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding` y `--disable-background-timer-throttling`. Fuentes: [chrome-launcher: flags](https://github.com/GoogleChrome/chrome-launcher/blob/main/docs/chrome-flags-for-tools.md), [sightmap PR #447](https://github.com/sightmap/sightmap/pull/447). **Minimizar** la ventana sigue deteniéndola: no minimizar nunca.
- **Importante:** Chrome ignora los flags si ya hay otro Chrome abierto con el mismo perfil → `start-stream.bat` usa su propio `--user-data-dir`.

### Voces TTS en español
- **CONFIRMADO (probado aquí).** En este PC Chrome ofrece **"Google español" (es-ES)** y **"Google español de Estados Unidos" (es-US)** (por internet) y además la voz local de Windows **"Microsoft Raul - Spanish (Mexico)" (es-MX)**. En la primera consulta solo aparecieron las de Google porque la lista de voces se carga por partes (`onvoiceschanged`); el juego la vuelve a pedir cuando cambia.
- **PROBABLE.** Se pueden instalar voces locales de Windows en español (por ejemplo, de México) desde *Configuración > Hora e idioma > Voz*; aparecerían como "Microsoft …" en `speechSynthesis.getVoices()`. Las voces locales no dependen de internet.
- **Cambio en el proyecto:** preferir es-CO, luego es-MX, luego es-US y luego cualquier voz es-*, configurable.

---

## 0.4 Audio con licencia segura

- **CONFIRMADO.** Packs de Kenney con licencia **Creative Commons CC0** (dominio público), verificada en cada página:
  - [Interface Sounds](https://kenney.nl/assets/interface-sounds) (100 archivos)
  - [Digital Audio](https://kenney.nl/assets/digital-audio) (60)
  - [Impact Sounds](https://kenney.nl/assets/impact-sounds) (130)
  - [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) (70)
  - [Music Jingles](https://kenney.nl/assets/music-jingles) (85)
- **CONFIRMADO.** **ZzFX** (síntesis procedural de efectos en < 1 KB) tiene **licencia MIT**. Crea su propio AudioContext conectado directo a la salida, así que para pasar por nuestros buses habría que modificarlo. Fuente: [ZzFX (GitHub)](https://github.com/KilledByAPixel/ZzFX).
- **Decisión:** el set "procedural" será **síntesis propia con Web Audio** (osciladores, ruido y envolventes), escrita desde cero. Cero dependencias y cero licencias de terceros, y usa directamente los buses sfx/music/tts. ZzFX queda como alternativa documentada.
- **Regla:** nunca sonidos de juegos reales ni música comercial.

---

## Resumen de fuentes consultadas
TikTok (oficial): LIVE Monetization Guidelines · LIVE Studio Help (Community Guidelines, What's a source, Add a capture source) · Discover (static image restrictions) · Newsroom (actualización de normas) · Seller Center (calidad de LIVE).
Terceros: sociallyin · livecade (restricciones, Marble Race) · Fastlane · darkroomagency · Upstream · TikRec · itch.io (World Cup Country Battle, Battle Country Arena) · TeamMedia Games · TikFinity (gift overlays, Event API) · tiklivegames · TikXander · CreaMate · Kreatli · CheckSafe.Zone · tiktokgames.live · npm registry · GitHub TikTok-Live-Connector (README, releases, issues) · Euler Stream pricing · TikTools · Chrome for Developers (autoplay) · blink-dev (speechSynthesis) · chrome-launcher flags · sightmap PR · Kenney (5 packs) · ZzFX.

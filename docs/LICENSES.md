# Licencias de recursos de terceros

Todo lo que no es código propio está aquí, con fuente, autor y licencia. Regla del proyecto: **nada con copyright**
(ni sonidos de juegos reales ni música comercial). Música de fondo: sintetizada en el propio código, apagada por defecto.

## Sonidos: set "kenney" (`game/assets/sfx/kenney/`)

Autor: **Kenney Vleugels (kenney.nl)**. Licencia: **Creative Commons Zero (CC0 1.0)**,
<http://creativecommons.org/publicdomain/zero/1.0/>, verificada en la página de cada pack y en el `License.txt`
incluido en cada ZIP: *"You may use these assets in personal and commercial projects. Credit (Kenney or
www.kenney.nl) would be nice but is not mandatory."*
Descargados el 28/09/2026. Los archivos se usan tal cual (ya son `.ogg` livianos: 404 KB en total).

| Archivo en el juego | Archivo original | Pack (URL) |
|---|---|---|
| eat.ogg | pluck_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| bombSpawn.ogg | tick_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| countBeep.ogg | select_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| go.ogg | confirmation_002.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| themeChange.ogg | maximize_006.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| danceTwinkle.ogg | glass_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| giftSmall.ogg | bong_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| follow.ogg | confirmation_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| teamJoin.ogg | drop_001.ogg | [Interface Sounds](https://kenney.nl/assets/interface-sounds) |
| megaFood.ogg | powerUp2.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| speed.ogg | phaserUp3.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| death.ogg | lowDown.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| giftMedium.ogg | twoTone1.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| giftBig.ogg | threeTone2.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| likeGoal.ogg | powerUp7.ogg | [Digital Audio](https://kenney.nl/assets/digital-audio) |
| wallSpawn.ogg | impactMetal_heavy_000.ogg | [Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| speedHum.ogg | engineCircular_000.ogg | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| explosion.ogg | explosionCrunch_000.ogg | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| headOn.ogg | lowFrequency_explosion_000.ogg | [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) |
| victory.ogg | Steel jingles/jingles_STEEL03.ogg | [Music Jingles](https://kenney.nl/assets/music-jingles) |
| giftEpic.ogg | Hit jingles/jingles_HIT05.ogg | [Music Jingles](https://kenney.nl/assets/music-jingles) |

## Sonidos: set "procedural" (por defecto)

Sintetizados en tiempo real con Web Audio (osciladores, ruido y envolventes) en `game/game.js`. Código propio,
sin archivos ni licencias de terceros.

## Voz

`speechSynthesis` del navegador (voces del sistema o de Google en Chrome). Solo lee plantillas fijas del juego
(nunca mensajes del chat).

## Imágenes de regalos (`game/assets/gifts/`, no van a git)

Las descarga el puente desde TikTok durante el live (modo descubrimiento) para mostrar el regalo en las
instrucciones. Son recursos de la propia plataforma donde se emite; no se redistribuyen.

## Código de terceros

| Paquete | Uso | Licencia |
|---|---|---|
| [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) 2.5.0 | leer eventos del LIVE | MIT |

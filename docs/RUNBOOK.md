# Manual de operación (RUNBOOK)

Guía para poner el juego en vivo en TikTok y mantenerlo funcionando. No hace falta saber programar.

> ⚠️ **Antes de nada, lee esto:** según las normas de TikTok, un LIVE que es solo un juego corriendo solo, **sin nadie
> presente**, puede quedarse **sin regalos (sin monetización)** y con menos alcance. Lo más seguro es que haya una persona
> en cámara y hablando mientras el juego corre, o hacer lives por bloques con alguien presente. Detalles en
> `docs/RESEARCH.md`, apartado 0.1.

---

## 1. Qué hay en el PC

| Pieza | Qué hace |
|---|---|
| **Puente** (ventana minimizada "Puente Snake TikTok") | Escucha tu LIVE de TikTok y le pasa al juego los regalos, likes, comentarios y follows. Si se cae, se levanta solo. |
| **Juego** (ventana de Chrome sin barras) | Lo que ve la gente. Es lo que capturas en TikTok LIVE Studio. |
| **Panel** (otra ventana de Chrome) | Tu mando: temática, pausa, volumen, simulador de regalos, estado de la conexión. Ponlo en el segundo monitor. |

Todo se abre y se cierra con dos archivos de la carpeta del proyecto:

- **`start-stream.bat`** (doble clic): abre todo.
- **`stop-stream.bat`** (doble clic): cierra todo.

---

## 2. Preparación (solo la primera vez)

1. Instalar **Node.js** (versión LTS) desde <https://nodejs.org> y **Google Chrome**.
2. En la carpeta del proyecto, copiar el archivo `.env.example` y renombrar la copia a **`.env`**.
3. Abrir `.env` con el Bloc de notas y poner tu usuario de TikTok **sin @**:
   ```
   TIKTOK_USER=sefigue.co
   ```
   Guardar. Nunca se pone la contraseña: el juego no la necesita.
4. Doble clic en `start-stream.bat`. La primera vez tarda un poco más porque instala lo que necesita.

---

## 3. Arrancar todo

1. Doble clic en **`start-stream.bat`**.
2. Se abren tres cosas: la ventana minimizada del puente, el **juego** y el **panel**.
3. En el panel, arriba, deben verse:
   - `puente conectado` (verde)
   - `juego: 60 fps` o parecido (verde)
   - `TikTok: …` en amarillo mientras no estés en vivo ("no está en vivo, reintentando"). **Es normal**: se pone
     verde ("conectado al LIVE") unos segundos después de que empieces el live.
4. En el juego, arriba a la izquierda (debajo de la barra de TikTok) hay un **punto**: verde = LIVE conectado,
   amarillo = esperando el live, rojo = sin puente.

---

## 4. Capturar el juego en TikTok LIVE Studio

**Opción A (recomendada): fuente "Link" (página web)**
1. En LIVE Studio: *Añadir fuente* → **Link**.
2. Dirección: `http://localhost:8080/`
3. Tamaño: **1080 × 1920** (vertical).
4. Si va a tirones o no se oye, usa la opción B.

**Opción B: capturar la ventana del juego**
1. *Añadir fuente* → **Captura de ventana** → elegir la ventana "Snake TikTok Live".
2. Problema: en un monitor horizontal de 1080 px de alto, la ventana del juego no cabe a 1080 × 1920 y se ve más
   pequeña. Solución: **girar un monitor externo a vertical**: clic derecho en el escritorio → *Configuración de
   pantalla* → elegir ese monitor → *Orientación: vertical*. Luego arrastrar la ventana del juego a ese monitor y
   maximizarla.

**Audio:** si la fuente no lleva el sonido del juego, añade en LIVE Studio una fuente de audio del escritorio
(audio del sistema). Pruébalo antes del primer live.

**Reglas de oro de la ventana del juego**
- **Nunca minimizarla.** Minimizada, Chrome la detiene.
- Puede quedar tapada por otras ventanas (el juego está preparado para eso), pero **no** la conviertas en una pestaña
  al lado del panel: una pestaña en segundo plano también se detiene.
- No cerrar la ventana minimizada "Puente Snake TikTok".

---

## 5. Windows para 24/7

- **No suspender:** *Configuración → Sistema → Inicio/apagado y suspensión*: pantalla y suspensión en **Nunca**
  (conectado a la corriente).
- **Windows Update:** *Configuración → Windows Update → Opciones avanzadas → Horas activas*: marcar las horas del live
  para que no reinicie en ese horario. Antes de un live largo, instalar actualizaciones pendientes y reiniciar.
- **Energía:** plan de energía "Alto rendimiento" o "Equilibrado", nunca "Ahorro de energía".
- **Notificaciones:** activar "No molestar" para que no salgan avisos encima del juego capturado.
- El juego se recarga solo cada 6 horas (al terminar una ronda) para mantenerse fresco. No se pierden marcadores,
  equipos ni el top de donadores.

---

## 6. Checklist antes de salir en vivo

- [ ] `start-stream.bat` abierto; en el panel: puente conectado y juego en verde.
- [ ] El juego se mueve (las culebras juegan solas) y no está en pausa.
- [ ] Sonido: en el panel, sección Audio, dice "activo". Pulsar **Probar voz** y un par de sonidos.
- [ ] En el panel, **Mock automático DESACTIVADO** (si está activado, el juego inventa regalos falsos).
- [ ] LIVE Studio captura el juego a 1080 × 1920 y se oye.
- [ ] Temática elegida (panel → Juego → Temática).
- [ ] Tecla **Z** en la ventana del juego: muestra en rojo lo que tapa la interfaz de TikTok. Volver a pulsar Z para
      quitarlo **antes de salir en vivo**.
- [ ] Empezar el live y comprobar que el panel pasa a **"TikTok: conectado al LIVE"** en menos de un minuto.

---

## 7. Si algo falla en vivo

| Qué pasa | Qué hacer |
|---|---|
| El panel dice "TikTok: no está en vivo" y ya estás en vivo | Esperar 1 minuto (reintenta solo). Si sigue, revisar que `.env` tenga bien el usuario. |
| "TikTok: error (reintentando)" durante mucho rato | Puede ser el servicio de firma (límite de conexiones). Sigue reintentando solo. Si dura más de 10 min, ver sección 9. |
| El punto del juego está **rojo** (sin puente) | El puente se reinicia solo en segundos. Si no vuelve, cerrar todo con `stop-stream.bat` y abrir `start-stream.bat`. |
| El juego no suena | Hacer clic una vez dentro de la ventana del juego. Revisar que no esté en "Silencio total" (panel o tecla S). |
| El juego se ve congelado | Panel → **Recargar el juego** (conserva marcadores y equipos). Si no responde, tecla F5 en la ventana del juego. |
| Alguien con un nombre ofensivo aparece en pantalla | Panel → Moderación → escribir su usuario → **Bloquear** (deja de mostrarse y leerse; sus regalos siguen funcionando). |
| Necesitas parar un momento | Panel → **Pausar** (o tecla P en el juego). |
| Cambiar de temática o modo | Panel → Juego (se aplica al terminar la ronda). |
| Todo raro | `stop-stream.bat`, esperar 5 s, `start-stream.bat`. |

**Atajos en la ventana del juego:** 1/2/3 temáticas · M modo · P pausa · N siguiente ronda · Z zonas de TikTok ·
D información técnica · S silencio.

---

## 8. PRUEBA DE FUEGO con el celular (antes del primer live desde el PC)

Objetivo: comprobar con TikTok de verdad que llegan regalos, likes y comentarios, y guardar los datos reales de los
regalos para ajustar el juego.

1. En el PC: doble clic en `start-stream.bat` (con `TIKTOK_USER=sefigue.co` en `.env`).
2. En el celular: **empezar un LIVE** desde la app de TikTok con la cuenta sefigue.co.
3. En el panel del PC, esperar a **"TikTok: conectado al LIVE"** (hasta 1 minuto).
4. Pedirle a un amigo que, desde su celular, entre al live y:
   - escriba en el chat **`colombia`** (y luego **`!team argentina`**),
   - dé **varios likes** (tocar la pantalla muchas veces),
   - envíe **una rosa** (y, si puede, algún otro regalo barato y una racha de rosas),
   - siga la cuenta y comparta el live.
5. Mirar el panel (lista de **Eventos**): debe aparecer cada cosa. Mirar el juego: comida, velocidad, avisos.
6. Terminar el live y cerrar con `stop-stream.bat`.
7. Enviar al equipo de desarrollo estos archivos de la carpeta del proyecto:
   - `logs/events-AAAA-MM-DD.jsonl` (todo lo que llegó de TikTok, en crudo)
   - `data/gift-catalog.json` (los regalos que se vieron, con su id y diamantes)
   - una **captura de pantalla del celular** mientras está en vivo, para ajustar las zonas que tapa TikTok.

Con eso se arma el mapeo final de regalos con los IDs reales.

---

## 9. Configuración (para quien la mantenga)

| Archivo | Para qué |
|---|---|
| `.env` | usuario de TikTok y API key de firma (no se sube a git) |
| `config/gift-mapping.json` | qué hace cada regalo, likes, follows y shares. Tras editarlo: panel → "Recargar gift-mapping.json" |
| `config/settings.json` | audio por defecto, tiempos, textos de los llamados, recarga cada N horas |
| `config/schedule.json` | programador de modos (ej. 90 min PvP → 20 min SOLO) |
| `config/name-filter.json` | palabras prohibidas en los nombres |

Si el servicio de firma se queda corto (errores de límite muy seguidos): crear una cuenta gratuita en Euler Stream,
copiar la API key en `.env` como `EULER_SIGN_API_KEY=...` y reiniciar con `stop-stream.bat` + `start-stream.bat`.

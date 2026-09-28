@echo off
rem ============================================================
rem  Arranca todo para transmitir:
rem   1. el puente (con supervisor que lo reinicia si se cae),
rem   2. el juego en Chrome modo app, con su propio perfil y los flags
rem      de autoplay y anti-throttling (ver docs/RESEARCH.md),
rem   3. el panel de control en otra ventana (para el segundo monitor).
rem  Para cerrar todo: stop-stream.bat
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)

if not exist "bridge\node_modules\tiktok-live-connector" (
  echo Instalando las dependencias del puente, solo la primera vez...
  pushd bridge
  call npm install --no-fund --no-audit
  popd
)

if not exist ".env" (
  echo AVISO: no existe el archivo .env. El puente arrancara en modo prueba ^(mock^).
  echo        Copia .env.example como .env y escribe tu usuario en TIKTOK_USER.
)

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" (
  echo No se encontro Google Chrome.
  pause
  exit /b 1
)

rem 1. Puente con supervisor, en una ventana minimizada
start "Puente Snake TikTok" /min cmd /c node bridge\supervisor.js
echo Esperando a que arranque el puente...
timeout /t 3 /nobreak >nul

rem 2. Juego. Perfil propio (si no, Chrome ignora los flags cuando ya hay otro Chrome abierto)
set "FLAGS=--no-first-run --no-default-browser-check --autoplay-policy=no-user-gesture-required --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling --disable-features=CalculateNativeWinOcclusion"
start "" "%CHROME%" --user-data-dir="%~dp0.chrome\juego" --app=http://localhost:8080/ --window-position=0,0 --window-size=1080,1920 %FLAGS%

rem 3. Panel de control (otra ventana; nunca en una pestaña al lado del juego)
start "" "%CHROME%" --user-data-dir="%~dp0.chrome\panel" --app=http://localhost:8080/control --window-size=1100,950 --no-first-run --no-default-browser-check

echo.
echo Listo: juego y panel abiertos.
echo  - No minimices la ventana del juego ni cierres la ventana "Puente Snake TikTok".
echo  - En TikTok LIVE Studio captura http://localhost:8080/ (ver docs\RUNBOOK.md).
timeout /t 8 >nul

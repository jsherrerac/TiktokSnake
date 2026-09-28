@echo off
rem Cierra lo que abrio start-stream.bat: el puente (y su supervisor) y las ventanas de Chrome del juego y del panel.
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = (Get-Location).Path;" ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -like '*bridge\supervisor.js*' -or $_.CommandLine -like '*bridge\tiktok-bridge.js*' -or $_.CommandLine -like ('*' + $root + '\.chrome\*')) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue };" ^
  "Write-Host 'Puente, juego y panel cerrados.'"
timeout /t 3 >nul

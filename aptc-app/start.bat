@echo off
setlocal
cd /d "%~dp0"

rem --- pick a free backend port (prefer 8000, fall back to 8010) ---
set "BACKEND_PORT=8000"
for /f %%i in ('powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 8000 -ErrorAction SilentlyContinue) { 'taken' } else { 'free' }"') do set "PORT8000=%%i"
if /i "%PORT8000%"=="taken" set "BACKEND_PORT=8010"

rem --- LAN IP so colleagues on the same network can reach the API ---
set "LAN_IP="
for /f %%i in ('powershell -NoProfile -Command "$p=''; foreach($x in @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue)){ if($p -eq '' -and $x.IPAddress -notlike '127.*' -and $x.IPAddress -notlike '169.254.*'){ $p=$x.IPAddress } }; $p"') do if not defined LAN_IP set "LAN_IP=%%i"
if not defined LAN_IP set "LAN_IP=localhost"

echo ============================================================
echo  APTC-Electrical and Building
echo    Backend  : http://localhost:%BACKEND_PORT%   (docs: /docs)
echo    Frontend : http://localhost:1183
echo    LAN      : http://%LAN_IP%:1183
echo    (the page derives the API host from itself — opening
echo     the app by localhost or by LAN IP both work)
echo ============================================================
echo.

start "APTC Backend :%BACKEND_PORT%" /D "%~dp0backend" cmd /k python -m uvicorn app.main:app --port %BACKEND_PORT% --host 0.0.0.0
start "APTC Frontend :1183" /D "%~dp0frontend" cmd /k "set VITE_API_PORT=%BACKEND_PORT%&& npm run dev -- --port 1183 --host --strictPort"

echo Waiting for servers to come up...
timeout /t 8 /nobreak >nul
start "" "http://localhost:1183"

echo.
echo Two windows opened (Backend / Frontend). Close those windows to stop the app.
endlocal

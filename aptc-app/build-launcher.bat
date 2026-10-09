@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  Building APTC-Electrical-and-Building.exe
echo  (starts backend + frontend on port 1183)
echo ============================================================
echo.

set "OUT=APTC-Electrical-and-Building.exe"
if exist "%OUT%" del /q "%OUT%"

set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if exist "%CSC%" goto :csc

echo [INFO] csc.exe not found - trying the PowerShell compiler instead ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$src = Get-Content -Raw -LiteralPath 'APTC-Launcher.cs'; Add-Type -TypeDefinition $src -Language CSharp -OutputAssembly '%OUT%' -OutputType ConsoleApplication"
if errorlevel 1 goto :failed
goto :check

:csc
"%CSC%" /nologo /codepage:65001 /target:exe /platform:anycpu /out:"%OUT%" "APTC-Launcher.cs"
if errorlevel 1 goto :failed

:check
if not exist "%OUT%" goto :failed

echo.
echo [OK]   %OUT% created.
echo        Double-click it to start the backend and the frontend on port 1183.
echo        Keep the .exe next to the backend\ and frontend\ folders.
echo.
pause
exit /b 0

:failed
echo.
echo [ERROR] Build failed. Make sure .NET Framework 4.x is available on this PC.
echo.
pause
exit /b 1

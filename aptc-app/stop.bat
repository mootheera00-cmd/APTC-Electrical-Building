@echo off
setlocal
echo Stopping APTC-Electrical and Building ...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name like '%%python%%' or Name='node.exe'\" | Where-Object { $_.CommandLine -match 'uvicorn app\.main' -or $_.CommandLine -match 'aptc-app' } | ForEach-Object { Write-Host ('  stopping PID ' + $_.ProcessId + '  ' + $_.Name); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Done - app stopped.
pause
endlocal

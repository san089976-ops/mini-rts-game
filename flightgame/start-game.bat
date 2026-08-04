@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === FCS Flight Game ===
echo.
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Install Node.js first.
  pause
  exit /b 1
)
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:5173/"
call npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  === Build FCS Portable EXE ===
echo.
call npm.cmd run build:win
if errorlevel 1 (
  echo Build failed
  pause
  exit /b 1
)
echo.
echo Done: release\FCS-Portable-1.0.0-x64.exe
dir /b release
pause

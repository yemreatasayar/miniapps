@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall MiniApps Helpers.ps1"
if errorlevel 1 (
  echo.
  echo Uninstall failed. Review the message above.
  pause
  exit /b 1
)
echo.
echo MiniApps Helpers were removed.
pause

@echo off
setlocal
if not exist "%~dp0Install MiniApps Helpers.ps1" (
  echo.
  echo HATA: Kurulum dosyalari eksik / bulunamadi.
  echo Bu dosyayi ZIP'in ICINDEN calistirdiniz.
  echo.
  echo Lutfen once ZIP'i bir klasore TAMAMEN cikartin ^(sag tik -^> Tumunu ayikla^),
  echo sonra "Install MiniApps Helpers.cmd" dosyasini o cikartilan klasorden calistirin.
  echo.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install MiniApps Helpers.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. Review the message above.
  pause
  exit /b 1
)
echo.
echo Installation completed.
pause

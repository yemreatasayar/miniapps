MINIAPPS HELPERS FOR WINDOWS

Supported: Windows 10 1809 or newer and Windows 11, x64.

Install:
1. Extract the ZIP file.
2. Double-click "Install MiniApps Helpers.cmd".
3. Keep the window open while Python, FFmpeg, LibreOffice and the Vocal
   Remover packages are installed. The first installation can take 10-30
   minutes on an older computer.
4. The helpers start automatically with your Windows session.

The installer shows numbered steps and saves a detailed log here:
  %LOCALAPPDATA%\MiniApps\Helpers\logs\installer.log

If installation is interrupted, run the installer again. Downloaded Python
packages and the completed Vocal Remover environment are reused.

The MiniApps runtime, cache and logs are stored in:
  %LOCALAPPDATA%\MiniApps\Helpers

If Python, FFmpeg or LibreOffice is missing, the installer uses WinGet to
install it. LibreOffice can require Windows administrator approval.

Vocal Remover processing stays on the device. The first launch downloads the
Demucs model and can take several minutes. Office-to-PDF conversion uses the
locally installed LibreOffice.

Uninstall:
Double-click "Uninstall MiniApps Helpers.cmd" from this extracted folder.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PackageRoot = Split-Path -Parent $PSCommandPath
$SourceRuntime = Join-Path $PackageRoot "runtime"
$InstallRoot = Join-Path $env:LOCALAPPDATA "MiniApps\Helpers"
$RuntimeRoot = Join-Path $InstallRoot "runtime"
$StartupRoot = [Environment]::GetFolderPath("Startup")
$StartupVbs = Join-Path $StartupRoot "MiniApps Helpers.vbs"
$StartScript = Join-Path $InstallRoot "Start MiniApps Helpers.ps1"

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Install-WinGetPackage {
  param(
    [string]$Id,
    [switch]$UserScope
  )

  $arguments = @(
    "install",
    "--id", $Id,
    "--exact",
    "--source", "winget",
    "--accept-package-agreements",
    "--accept-source-agreements",
    "--silent"
  )
  if ($UserScope) {
    $arguments += @("--scope", "user")
  }

  Write-Host "Installing $Id..."
  & winget @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "WinGet could not install $Id (exit code $LASTEXITCODE)."
  }
  Refresh-ProcessPath
}

function Find-Python311 {
  $pyLauncher = Get-Command "py.exe" -ErrorAction SilentlyContinue
  if ($pyLauncher) {
    $pythonExecutable = & $pyLauncher.Source -3.11 -c "import sys; print(sys.executable)" 2>$null
    if ($LASTEXITCODE -eq 0) {
      return ([string]$pythonExecutable).Trim()
    }
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
    (Join-Path $env:ProgramFiles "Python311\python.exe")
  )
  return $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

function Find-WinGetExecutable {
  param(
    [string]$CommandName,
    [string]$FileName
  )

  $command = Get-Command $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $linksCandidate = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\$FileName"
  if (Test-Path $linksCandidate) {
    return $linksCandidate
  }

  $packagesRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path $packagesRoot) {
    return Get-ChildItem -Path $packagesRoot -Filter $FileName -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }

  return $null
}

function Find-LibreOffice {
  $roots = @(
    $env:ProgramW6432,
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)}
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($root in $roots) {
    $candidate = Join-Path $root "LibreOffice\program\soffice.exe"
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  return $null
}

function Find-Ghostscript {
  $roots = @(
    $env:ProgramW6432,
    $env:ProgramFiles,
    ${env:ProgramFiles(x86)}
  ) | Where-Object { $_ } | Select-Object -Unique

  foreach ($root in $roots) {
    $gsRoot = Join-Path $root "gs"
    if (-not (Test-Path $gsRoot)) {
      continue
    }

    $candidate = Get-ChildItem -Path $gsRoot -Filter "gswin64c.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1 -ExpandProperty FullName
    if ($candidate) {
      return $candidate
    }
  }
  return $null
}

function Wait-HelperHealth {
  param(
    [string]$Name,
    [string]$Url,
    [string]$ProcessName,
    [string]$OutputLogPath,
    [string]$ErrorLogPath
  )

  for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
    try {
      return Invoke-RestMethod -Uri $Url -TimeoutSec 3
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  $processDetails = "PID unavailable"
  $pidPath = Join-Path $InstallRoot "helper-processes.json"
  if (Test-Path $pidPath) {
    $pidMap = Get-Content -Raw $pidPath | ConvertFrom-Json
    $processId = $pidMap.$ProcessName
    if ($processId) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $processDetails = "PID $processId, running: $([bool]$process)"
    }
  }

  $outputDetails = ""
  if (Test-Path $OutputLogPath) {
    $outputDetails = (Get-Content $OutputLogPath -Tail 40) -join "`n"
  }
  $errorDetails = ""
  if (Test-Path $ErrorLogPath) {
    $errorDetails = (Get-Content $ErrorLogPath -Tail 40) -join "`n"
  }
  throw "$Name did not become ready within 60 seconds.`n$processDetails`nstdout:`n$outputDetails`nstderr:`n$errorDetails"
}

try {
if (-not (Test-Path $SourceRuntime)) {
  throw "Package runtime is missing: $SourceRuntime"
}
if (-not (Get-Command "winget.exe" -ErrorAction SilentlyContinue)) {
  throw "Windows Package Manager (winget) is required. Install App Installer from Microsoft Store."
}

Write-Host "Installing MiniApps Helpers into $InstallRoot"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
if (Test-Path $RuntimeRoot) {
  Remove-Item $RuntimeRoot -Recurse -Force
}
Copy-Item $SourceRuntime $RuntimeRoot -Recurse -Force
Copy-Item (Join-Path $PackageRoot "Start MiniApps Helpers.ps1") $StartScript -Force

$pythonPath = Find-Python311
if (-not $pythonPath) {
  Install-WinGetPackage -Id "Python.Python.3.11" -UserScope
  $pythonPath = Find-Python311
}
if (-not $pythonPath) {
  throw "Python 3.11 could not be located after installation."
}

$ffmpegPath = Find-WinGetExecutable -CommandName "ffmpeg.exe" -FileName "ffmpeg.exe"
$ffprobePath = Find-WinGetExecutable -CommandName "ffprobe.exe" -FileName "ffprobe.exe"
if (-not $ffmpegPath -or -not $ffprobePath) {
  Install-WinGetPackage -Id "Gyan.FFmpeg" -UserScope
  $ffmpegPath = Find-WinGetExecutable -CommandName "ffmpeg.exe" -FileName "ffmpeg.exe"
  $ffprobePath = Find-WinGetExecutable -CommandName "ffprobe.exe" -FileName "ffprobe.exe"
}
if (-not $ffmpegPath -or -not $ffprobePath) {
  throw "FFmpeg or FFprobe could not be located after installation."
}

$libreOfficePath = Find-LibreOffice
if (-not $libreOfficePath) {
  Install-WinGetPackage -Id "TheDocumentFoundation.LibreOffice"
  $libreOfficePath = Find-LibreOffice
}
if (-not $libreOfficePath) {
  throw "LibreOffice could not be located after installation."
}

$venvRoot = Join-Path $RuntimeRoot "stem\.venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
if (-not (Test-Path $venvPython)) {
  Write-Host "Creating the isolated Vocal Remover Python environment..."
  & $pythonPath -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Python virtual environment creation failed."
  }
}

$requirementsPath = Join-Path $RuntimeRoot "stem\app\requirements-windows.txt"
& $venvPython -m pip install --disable-pip-version-check --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "pip upgrade failed."
}
& $venvPython -m pip install `
  --disable-pip-version-check `
  --index-url "https://download.pytorch.org/whl/cpu" `
  "torch==2.8.0" `
  "torchaudio==2.8.0"
if ($LASTEXITCODE -ne 0) {
  throw "CPU-only Torch dependencies could not be installed."
}
& $venvPython -m pip install --disable-pip-version-check -r $requirementsPath
if ($LASTEXITCODE -ne 0) {
  throw "Vocal Remover dependencies could not be installed."
}

$stemConfig = @{
  baseDir = (Join-Path $RuntimeRoot "stem")
  host = "127.0.0.1"
  port = 4195
  tmpDir = "./tmp"
  pythonBin = $venvPython
  ffmpegBin = $ffmpegPath
  ffprobeBin = $ffprobePath
  modelName = "htdemucs"
  helperVersion = "0.2.0"
  platform = "windows-x64"
  allowedOrigins = @(
    "https://miniapps.tr",
    "https://www.miniapps.tr",
    "https://yemreatasayar.github.io",
    "http://127.0.0.1:4310",
    "http://127.0.0.1:4194",
    "http://localhost:4310",
    "http://localhost:4194"
  )
}
$stemConfig | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $InstallRoot "stem-helper-config.json")

$ghostscriptPath = Find-Ghostscript
$pdfEnv = @{
  libreOfficePath = $libreOfficePath
  ghostscriptPath = $ghostscriptPath
}
$pdfEnv | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $InstallRoot "pdf-helper-env.json")

$escapedStartScript = $StartScript.Replace('"', '""')
$vbsContent = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$escapedStartScript""", 0, False
"@
$vbsContent | Set-Content -Encoding ASCII $StartupVbs

& $StartScript

$pdfHealth = Wait-HelperHealth `
  -Name "PDF Helper" `
  -Url "http://127.0.0.1:4184/health" `
  -ProcessName "pdf" `
  -OutputLogPath (Join-Path $InstallRoot "logs\pdf-helper.out.log") `
  -ErrorLogPath (Join-Path $InstallRoot "logs\pdf-helper.err.log")
$stemHealth = Wait-HelperHealth `
  -Name "Stem Helper" `
  -Url "http://127.0.0.1:4195/api/health" `
  -ProcessName "stem" `
  -OutputLogPath (Join-Path $InstallRoot "logs\stem-helper.out.log") `
  -ErrorLogPath (Join-Path $InstallRoot "logs\stem-helper.err.log")
if (-not $pdfHealth.libreOffice) {
  throw "PDF Helper started, but LibreOffice was not detected."
}
if (-not $stemHealth.pythonInstalled -or -not $stemHealth.ffmpegInstalled) {
  throw "Stem Helper started, but Python or FFmpeg validation failed."
}

Write-Host ""
Write-Host "MiniApps Helpers are running."
Write-Host "Vocal Remover model warm-up continues in the background on first use."
if (-not $pdfHealth.ghostscript) {
  Write-Host "Ghostscript is not installed; Office conversion works, PDF compression remains browser-only."
}
} catch {
  $line = $_.InvocationInfo.ScriptLineNumber
  $message = $_.Exception.Message.Replace("`r", "").Replace("`n", "%0A")
  Write-Host "::error file=distribution/stem-helper/templates-windows/Install MiniApps Helpers.ps1,line=${line}::$message"
  throw
}

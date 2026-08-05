$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PackageRoot = Split-Path -Parent $PSCommandPath
$SourceRuntime = Join-Path $PackageRoot "runtime"
$InstallRoot = Join-Path $env:LOCALAPPDATA "MiniApps\Helpers"
$RuntimeRoot = Join-Path $InstallRoot "runtime"
$StartupRoot = [Environment]::GetFolderPath("Startup")
$StartupVbs = Join-Path $StartupRoot "MiniApps Helpers.vbs"
$StartScript = Join-Path $InstallRoot "Start MiniApps Helpers.ps1"
$LogRoot = Join-Path $InstallRoot "logs"
$InstallerLogPath = Join-Path $LogRoot "installer.log"
$InstallerStatePath = Join-Path $InstallRoot "installer-state.json"
$PidPath = Join-Path $InstallRoot "helper-processes.json"
$PipCacheRoot = Join-Path $InstallRoot "cache\pip"
$script:InstallStep = 0
$script:InstallStepTotal = 9
$script:TranscriptStarted = $false

function Write-InstallStep {
  param([string]$Message)

  $script:InstallStep += 1
  Write-Host ""
  Write-Host "[$script:InstallStep/$script:InstallStepTotal] $Message" -ForegroundColor Cyan
}

function Write-InstallerState {
  param(
    [string]$Status,
    [string]$Message
  )

  if (-not (Test-Path $InstallRoot)) {
    return
  }
  try {
    $state = @{
      status = $Status
      step = $script:InstallStep
      totalSteps = $script:InstallStepTotal
      message = $Message
      updatedAt = (Get-Date).ToUniversalTime().ToString("o")
      logPath = $InstallerLogPath
    }
    Write-Utf8NoBom -Path $InstallerStatePath -Content ($state | ConvertTo-Json)
  } catch {
    Write-Warning "Installer state could not be written: $($_.Exception.Message)"
  }
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Content
  )

  $encoding = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Install-WinGetPackage {
  param(
    [string]$Id,
    [switch]$UserScope
  )

  if (-not (Get-Command "winget.exe" -ErrorAction SilentlyContinue)) {
    throw "Windows Package Manager (winget) is required to install $Id. Install App Installer from Microsoft Store, then run this installer again."
  }

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

  $startedAt = Get-Date
  Write-Host "Installing $Id... This can take several minutes."
  & winget @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "WinGet could not install $Id (exit code $LASTEXITCODE)."
  }
  $elapsed = [Math]::Round(((Get-Date) - $startedAt).TotalMinutes, 1)
  Write-Host "$Id installed in $elapsed minute(s)."
  Refresh-ProcessPath
}

function Stop-InstalledHelpers {
  $installedNodePath = Join-Path $RuntimeRoot "node\node.exe"
  $candidateProcessIds = [System.Collections.Generic.HashSet[int]]::new()

  if (Test-Path $PidPath) {
    try {
      $processes = Get-Content -Raw $PidPath | ConvertFrom-Json
      foreach ($property in $processes.PSObject.Properties) {
        $processId = [int]$property.Value
        if ($processId -gt 0) {
          $null = $candidateProcessIds.Add($processId)
        }
      }
    } catch {
      Write-Warning "The previous helper process list could not be read. Listening ports will be checked instead."
    }
  }

  try {
    foreach ($port in @(4184, 4195)) {
      Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        ForEach-Object { $null = $candidateProcessIds.Add([int]$_.OwningProcess) }
    }
  } catch {
    Write-Warning "Listening helper ports could not be inspected."
  }

  foreach ($processId in $candidateProcessIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }

    try {
      $processPath = [System.IO.Path]::GetFullPath($process.Path)
      $expectedPath = [System.IO.Path]::GetFullPath($installedNodePath)
      if ($processPath -ieq $expectedPath) {
        Write-Host "Stopping installed MiniApps Helper process $processId..."
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } else {
        Write-Warning "Process $processId was not stopped because it is not the installed MiniApps node.exe."
      }
    } catch {
      Write-Warning "Process $processId could not be safely identified or stopped: $($_.Exception.Message)"
    }
  }

  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}

function Sync-RuntimeDirectory {
  param([string]$RelativePath)

  $source = Join-Path $SourceRuntime $RelativePath
  $target = Join-Path $RuntimeRoot $RelativePath
  if (-not (Test-Path $source)) {
    throw "Package component is missing: $source"
  }

  if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
  }
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item $source $target -Recurse -Force
}

function Test-StemDependencies {
  param(
    [string]$PythonPath,
    [string]$StampPath,
    [string]$Fingerprint
  )

  if (-not (Test-Path $PythonPath) -or -not (Test-Path $StampPath)) {
    return $false
  }

  try {
    $stamp = Get-Content -Raw $StampPath | ConvertFrom-Json
    if ([string]$stamp.fingerprint -ne $Fingerprint) {
      return $false
    }
    & $PythonPath -c "import demucs, torch, torchaudio" 2>$null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

function Show-SystemWarnings {
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "MiniApps Helpers requires 64-bit Windows."
  }

  try {
    $driveName = (Split-Path -Qualifier $InstallRoot).Substring(0, 1)
    $freeGb = [Math]::Round((Get-PSDrive -Name $driveName).Free / 1GB, 1)
    Write-Host "Free disk space: $freeGb GB"
    if ($freeGb -lt 8) {
      Write-Warning "Less than 8 GB is free. Vocal Remover dependencies may fail to install."
    }
  } catch {
    Write-Warning "Free disk space could not be checked."
  }
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

function Invoke-LocalJson {
  param(
    [string]$Url,
    [int]$TimeoutMilliseconds = 5000
  )

  $timeoutSeconds = [Math]::Max(1, [Math]::Ceiling($TimeoutMilliseconds / 1000))
  $output = & curl.exe `
    --silent `
    --show-error `
    --fail `
    --noproxy "*" `
    --max-time $timeoutSeconds `
    $Url
  if ($LASTEXITCODE -ne 0) {
    throw "Local request failed for $Url (exit code $LASTEXITCODE)."
  }
  return (($output -join "`n") | ConvertFrom-Json)
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
      return Invoke-LocalJson -Url $Url -TimeoutMilliseconds 3000
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

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
New-Item -ItemType Directory -Path $PipCacheRoot -Force | Out-Null
try {
  Start-Transcript -Path $InstallerLogPath -Append | Out-Null
  $script:TranscriptStarted = $true
} catch {
  Write-Warning "Installer transcript could not be started: $($_.Exception.Message)"
}

try {
Write-InstallStep "Checking the package and this computer"
if (-not (Test-Path $SourceRuntime)) {
  throw "Package runtime is missing: $SourceRuntime"
}
Show-SystemWarnings
Write-InstallerState -Status "running" -Message "Preflight checks completed."

Write-InstallStep "Stopping an older MiniApps Helper instance"
Stop-InstalledHelpers
Write-InstallerState -Status "running" -Message "Older helper processes stopped."

Write-InstallStep "Updating MiniApps Helper application files"
Write-Host "Installing MiniApps Helpers into $InstallRoot"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
Sync-RuntimeDirectory -RelativePath "node"
Sync-RuntimeDirectory -RelativePath "pdf"
Sync-RuntimeDirectory -RelativePath "stem\app"
Copy-Item (Join-Path $PackageRoot "Start MiniApps Helpers.ps1") $StartScript -Force
if (Test-Path (Join-Path $PackageRoot "runtime-sources.json")) {
  Copy-Item (Join-Path $PackageRoot "runtime-sources.json") (Join-Path $InstallRoot "runtime-sources.json") -Force
}
Write-Host "Existing Vocal Remover environment and download cache were preserved."
Write-InstallerState -Status "running" -Message "Application files updated."

Write-InstallStep "Checking Python 3.11"
$pythonPath = Find-Python311
if (-not $pythonPath) {
  Install-WinGetPackage -Id "Python.Python.3.11" -UserScope
  $pythonPath = Find-Python311
}
if (-not $pythonPath) {
  throw "Python 3.11 could not be located after installation."
}
Write-Host "Python: $pythonPath"

Write-InstallStep "Checking FFmpeg"
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
Write-Host "FFmpeg: $ffmpegPath"

Write-InstallStep "Checking LibreOffice"
$libreOfficePath = Find-LibreOffice
if (-not $libreOfficePath) {
  Install-WinGetPackage -Id "TheDocumentFoundation.LibreOffice"
  $libreOfficePath = Find-LibreOffice
}
if (-not $libreOfficePath) {
  throw "LibreOffice could not be located after installation."
}
Write-Host "LibreOffice: $libreOfficePath"

Write-InstallStep "Preparing Vocal Remover dependencies"
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
$requirementsHash = (Get-FileHash -Algorithm SHA256 $requirementsPath).Hash.ToLowerInvariant()
$dependencyFingerprint = "torch=2.8.0;torchaudio=2.8.0;requirements=$requirementsHash"
$dependencyStampPath = Join-Path $venvRoot "miniapps-dependencies.json"
$dependenciesReady = Test-StemDependencies `
  -PythonPath $venvPython `
  -StampPath $dependencyStampPath `
  -Fingerprint $dependencyFingerprint

if ($dependenciesReady) {
  Write-Host "Vocal Remover dependencies are already ready; download skipped." -ForegroundColor Green
} else {
  Write-Host "Downloading/installing Vocal Remover dependencies. On older computers this can take 10-30 minutes."
  & $venvPython -m pip install `
    --disable-pip-version-check `
    --cache-dir $PipCacheRoot `
    --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    throw "pip upgrade failed."
  }
  & $venvPython -m pip install `
    --disable-pip-version-check `
    --cache-dir $PipCacheRoot `
    --index-url "https://download.pytorch.org/whl/cpu" `
    "torch==2.8.0" `
    "torchaudio==2.8.0"
  if ($LASTEXITCODE -ne 0) {
    throw "CPU-only Torch dependencies could not be installed. Run the installer again; downloaded files are cached."
  }
  & $venvPython -m pip install `
    --disable-pip-version-check `
    --cache-dir $PipCacheRoot `
    -r $requirementsPath
  if ($LASTEXITCODE -ne 0) {
    throw "Vocal Remover dependencies could not be installed. Run the installer again; downloaded files are cached."
  }

  $dependencyStamp = @{
    fingerprint = $dependencyFingerprint
    installedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
  Write-Utf8NoBom -Path $dependencyStampPath -Content ($dependencyStamp | ConvertTo-Json)
}
Write-InstallerState -Status "running" -Message "Vocal Remover dependencies are ready."

Write-InstallStep "Writing configuration and automatic startup"
$stemConfig = @{
  baseDir = (Join-Path $RuntimeRoot "stem")
  host = "127.0.0.1"
  port = 4195
  tmpDir = "./tmp"
  pythonBin = $venvPython
  ffmpegBin = $ffmpegPath
  ffprobeBin = $ffprobePath
  modelName = "htdemucs"
  helperVersion = "0.2.1"
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
Write-Utf8NoBom `
  -Path (Join-Path $InstallRoot "stem-helper-config.json") `
  -Content ($stemConfig | ConvertTo-Json -Depth 4)

$ghostscriptPath = Find-Ghostscript
$pdfEnv = @{
  libreOfficePath = $libreOfficePath
  ghostscriptPath = $ghostscriptPath
}
Write-Utf8NoBom `
  -Path (Join-Path $InstallRoot "pdf-helper-env.json") `
  -Content ($pdfEnv | ConvertTo-Json)

$escapedStartScript = $StartScript.Replace('"', '""')
$vbsContent = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$escapedStartScript""", 0, False
"@
$vbsContent | Set-Content -Encoding ASCII $StartupVbs

Write-InstallStep "Starting and validating MiniApps Helpers"
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
Write-Host "Installer log: $InstallerLogPath"
if (-not $pdfHealth.ghostscript) {
  Write-Host "Ghostscript is not installed; Office conversion works, PDF compression remains browser-only."
}
Write-InstallerState -Status "completed" -Message "MiniApps Helpers are running."
} catch {
  $line = $_.InvocationInfo.ScriptLineNumber
  $message = $_.Exception.Message.Replace("`r", "").Replace("`n", "%0A")
  Write-InstallerState -Status "failed" -Message $_.Exception.Message
  Write-Host ""
  Write-Host "Installation failed at step $script:InstallStep/$script:InstallStepTotal." -ForegroundColor Red
  Write-Host "Run the installer again to continue. Existing downloads are kept."
  Write-Host "Installer log: $InstallerLogPath"
  Write-Host "::error file=distribution/stem-helper/templates-windows/Install MiniApps Helpers.ps1,line=${line}::$message"
  throw
} finally {
  if ($script:TranscriptStarted) {
    try {
      Stop-Transcript | Out-Null
    } catch {
      # Transcript may already be stopped by the host.
    }
  }
}

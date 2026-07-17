$ErrorActionPreference = "Stop"

$InstallRoot = Split-Path -Parent $PSCommandPath
$RuntimeRoot = Join-Path $InstallRoot "runtime"
$NodePath = Join-Path $RuntimeRoot "node\node.exe"
$StemConfigPath = Join-Path $InstallRoot "stem-helper-config.json"
$PdfEnvPath = Join-Path $InstallRoot "pdf-helper-env.json"
$LogRoot = Join-Path $InstallRoot "logs"
$PidPath = Join-Path $InstallRoot "helper-processes.json"

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null

function Test-HelperHealth {
  param([string]$Url)
  try {
    $null = Invoke-RestMethod -Uri $Url -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Start-HelperProcess {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $stdoutPath = Join-Path $LogRoot "$Name.out.log"
  $stderrPath = Join-Path $LogRoot "$Name.err.log"
  $quotedArguments = $Arguments | ForEach-Object {
    '"{0}"' -f $_.Replace('"', '\"')
  }
  return Start-Process `
    -FilePath $NodePath `
    -ArgumentList $quotedArguments `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru
}

if (-not (Test-Path $NodePath)) {
  throw "Bundled node.exe is missing: $NodePath"
}

$processes = @{}

if (-not (Test-HelperHealth "http://127.0.0.1:4195/api/health")) {
  $stemAppRoot = Join-Path $RuntimeRoot "stem\app"
  $stemProcess = Start-HelperProcess `
    -Name "stem-helper" `
    -Arguments @((Join-Path $stemAppRoot "server.mjs"), "--config", $StemConfigPath) `
    -WorkingDirectory $stemAppRoot
  $processes["stem"] = $stemProcess.Id
}

if (Test-Path $PdfEnvPath) {
  $pdfEnv = Get-Content -Raw $PdfEnvPath | ConvertFrom-Json
  if ($pdfEnv.libreOfficePath) {
    $env:MINIAPPS_LIBREOFFICE_PATH = $pdfEnv.libreOfficePath
  }
  if ($pdfEnv.ghostscriptPath) {
    $env:MINIAPPS_PDF_GS_PATH = $pdfEnv.ghostscriptPath
  }
}

if (-not (Test-HelperHealth "http://127.0.0.1:4184/health")) {
  $pdfAppRoot = Join-Path $RuntimeRoot "pdf"
  $pdfProcess = Start-HelperProcess `
    -Name "pdf-helper" `
    -Arguments @((Join-Path $pdfAppRoot "server.mjs")) `
    -WorkingDirectory $pdfAppRoot
  $processes["pdf"] = $pdfProcess.Id
}

$processes | ConvertTo-Json | Set-Content -Encoding UTF8 $PidPath

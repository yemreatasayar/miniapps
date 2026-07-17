$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:LOCALAPPDATA "MiniApps\Helpers"
$StartupVbs = Join-Path ([Environment]::GetFolderPath("Startup")) "MiniApps Helpers.vbs"
$PidPath = Join-Path $InstallRoot "helper-processes.json"

if (Test-Path $PidPath) {
  $processes = Get-Content -Raw $PidPath | ConvertFrom-Json
  foreach ($property in $processes.PSObject.Properties) {
    if ($property.Value) {
      Stop-Process -Id ([int]$property.Value) -Force -ErrorAction SilentlyContinue
    }
  }
}

Remove-Item $StartupVbs -Force -ErrorAction SilentlyContinue
Remove-Item $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue

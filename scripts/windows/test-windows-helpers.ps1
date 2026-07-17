param(
  [Parameter(Mandatory = $true)]
  [string]$PackageRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$InstallRoot = Join-Path $env:LOCALAPPDATA "MiniApps\Helpers"
$StemConfigPath = Join-Path $InstallRoot "stem-helper-config.json"
$VenvPython = Join-Path $InstallRoot "runtime\stem\.venv\Scripts\python.exe"
$TestRoot = Join-Path $env:RUNNER_TEMP "miniapps-windows-helper-test"

function Invoke-LocalJson {
  param(
    [string]$Url,
    [hashtable]$Headers = @{},
    [int]$TimeoutMilliseconds = 5000
  )

  $arguments = @(
    "--silent",
    "--show-error",
    "--fail",
    "--noproxy", "*",
    "--max-time", ([Math]::Max(1, [Math]::Ceiling($TimeoutMilliseconds / 1000)))
  )
  foreach ($header in $Headers.GetEnumerator()) {
    $arguments += @("-H", "$($header.Key): $($header.Value)")
  }
  $arguments += $Url
  $output = & curl.exe @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Local request failed for $Url (exit code $LASTEXITCODE)."
  }
  return (($output -join "`n") | ConvertFrom-Json)
}

if (Test-Path $TestRoot) {
  Remove-Item $TestRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TestRoot -Force | Out-Null

try {
Write-Host "Running the packaged installer..."
& powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File (Join-Path $PackageRoot "Install MiniApps Helpers.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Packaged helper installation failed."
}

$stemConfig = Get-Content -Raw $StemConfigPath | ConvertFrom-Json
$ffmpeg = [string]$stemConfig.ffmpegBin
$ffprobe = [string]$stemConfig.ffprobeBin

Write-Host "Waiting for Demucs warm-up..."
$stemHealth = $null
for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
  try {
    $stemHealth = Invoke-LocalJson `
      -Url "http://127.0.0.1:4195/api/health" `
      -TimeoutMilliseconds 5000
    if ($stemHealth.warmup.status -eq "ready") {
      break
    }
    if ($stemHealth.warmup.status -eq "error") {
      throw "Demucs warm-up failed: $($stemHealth.warmup.message)"
    }
  } catch {
    if ($_.Exception.Message -like "Demucs warm-up failed:*") {
      throw
    }
  }
  Start-Sleep -Seconds 10
}
if (-not $stemHealth -or $stemHealth.warmup.status -ne "ready") {
  throw "Demucs warm-up did not become ready within 30 minutes."
}
if (-not $stemHealth.pythonInstalled -or -not $stemHealth.ffmpegInstalled) {
  throw "Stem Helper health validation failed."
}

$audioPath = Join-Path $TestRoot "reference.wav"
& $ffmpeg `
  -y `
  -f lavfi `
  -i "sine=frequency=440:duration=8" `
  -f lavfi `
  -i "sine=frequency=660:duration=8" `
  -filter_complex "[0:a][1:a]amix=inputs=2:duration=shortest" `
  -ac 2 `
  -ar 44100 `
  $audioPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $audioPath)) {
  throw "Reference audio generation failed."
}

$splitResponsePath = Join-Path $TestRoot "split-response.json"
& curl.exe `
  --silent `
  --show-error `
  --fail `
  --noproxy "*" `
  -H "Origin: https://miniapps.tr" `
  -F "file=@$audioPath;type=audio/wav" `
  -o $splitResponsePath `
  "http://127.0.0.1:4195/api/split"
if ($LASTEXITCODE -ne 0) {
  throw "Stem upload failed."
}

$splitResponse = Get-Content -Raw $splitResponsePath | ConvertFrom-Json
$jobId = [string]$splitResponse.jobId
if (-not $jobId) {
  throw "Stem Helper did not return a job id."
}

$job = $null
for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
  $job = Invoke-LocalJson `
    -Url "http://127.0.0.1:4195/api/jobs/$jobId" `
    -Headers @{ Origin = "https://miniapps.tr" } `
    -TimeoutMilliseconds 5000
  if ($job.status -eq "done") {
    break
  }
  if ($job.status -eq "error") {
    throw "Stem job failed: $($job.error)"
  }
  Start-Sleep -Seconds 5
}
if (-not $job -or $job.status -ne "done") {
  throw "Stem job did not finish within 10 minutes."
}

foreach ($stem in @("vocals", "instrumental")) {
  $outputPath = Join-Path $TestRoot "$stem.mp3"
  & curl.exe `
    --silent `
    --show-error `
    --fail `
    --noproxy "*" `
    -H "Origin: https://miniapps.tr" `
    -o $outputPath `
    "http://127.0.0.1:4195/api/download/$jobId/$stem"
  if ($LASTEXITCODE -ne 0 -or (Get-Item $outputPath).Length -lt 10KB) {
    throw "$stem output is missing or invalid."
  }
  & $ffprobe -v error -show_entries format=duration -of default=nw=1 $outputPath
  if ($LASTEXITCODE -ne 0) {
    throw "$stem output did not pass FFprobe validation."
  }
}

Write-Host "Preparing an Office conversion fixture..."
& $VenvPython -m pip install --disable-pip-version-check python-pptx==1.0.2 pillow==11.3.0 pypdf==6.1.1
if ($LASTEXITCODE -ne 0) {
  throw "Office test dependencies could not be installed."
}

$fixtureScript = Join-Path $TestRoot "create_fixture.py"
@'
from pathlib import Path
from PIL import Image, ImageDraw
from pptx import Presentation
from pptx.util import Inches

root = Path(__file__).parent
icon_path = root / "icon.png"
image = Image.new("RGBA", (64, 64), (255, 255, 255, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((4, 4, 60, 60), radius=12, fill=(35, 111, 237, 255))
draw.ellipse((22, 22, 42, 42), fill=(255, 255, 255, 255))
image.save(icon_path)

presentation = Presentation()
slide = presentation.slides.add_slide(presentation.slide_layouts[5])
title = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(7), Inches(1))
title.text_frame.text = "MiniApps Windows Office conversion"
slide.shapes.add_picture(str(icon_path), Inches(1), Inches(2.2), width=Inches(0.6))
presentation.save(root / "office-fixture.pptx")
'@ | Set-Content -Encoding UTF8 $fixtureScript

& $VenvPython $fixtureScript
if ($LASTEXITCODE -ne 0) {
  throw "Office fixture creation failed."
}

$pdfHealth = Invoke-LocalJson `
  -Url "http://127.0.0.1:4184/health" `
  -TimeoutMilliseconds 10000
if (-not $pdfHealth.libreOffice) {
  throw "PDF Helper did not detect LibreOffice on Windows."
}

$pptxPath = Join-Path $TestRoot "office-fixture.pptx"
$pdfPath = Join-Path $TestRoot "office-fixture.pdf"
& curl.exe `
  --silent `
  --show-error `
  --fail `
  --noproxy "*" `
  -H "Origin: https://miniapps.tr" `
  -F "file=@$pptxPath;type=application/vnd.openxmlformats-officedocument.presentationml.presentation" `
  -o $pdfPath `
  "http://127.0.0.1:4184/convert"
if ($LASTEXITCODE -ne 0 -or (Get-Item $pdfPath).Length -lt 1KB) {
  throw "Office-to-PDF conversion failed."
}

$verifyScript = Join-Path $TestRoot "verify_pdf.py"
@'
from pathlib import Path
from pypdf import PdfReader

pdf_path = Path(__file__).parent / "office-fixture.pdf"
reader = PdfReader(pdf_path)
assert len(reader.pages) == 1, f"Expected one page, got {len(reader.pages)}"
resources = reader.pages[0].get("/Resources")
xobjects = resources.get("/XObject") if resources else None
assert xobjects and len(xobjects) >= 1, "Embedded icon was not retained in PDF output"
assert "MiniApps Windows Office conversion" in (reader.pages[0].extract_text() or "")
print(f"Office PDF verified: {pdf_path.stat().st_size} bytes, {len(xobjects)} XObjects")
'@ | Set-Content -Encoding UTF8 $verifyScript

& $VenvPython $verifyScript
if ($LASTEXITCODE -ne 0) {
  throw "Converted PDF validation failed."
}

Write-Host "Windows Stem Helper and Office conversion smoke tests passed."
} catch {
  $line = $_.InvocationInfo.ScriptLineNumber
  $message = $_.Exception.Message.Replace("`r", "").Replace("`n", "%0A")
  Write-Host "::error file=scripts/windows/test-windows-helpers.ps1,line=${line}::$message"
  throw
}

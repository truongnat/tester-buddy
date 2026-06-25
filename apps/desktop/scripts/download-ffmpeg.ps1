param(
  [string]$Platform = ""
)

if (-not $Platform) {
  $Platform = if ([Environment]::Is64BitOperatingSystem) { "win64" } else { "win32" }
}

$baseUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"
$archive = "ffmpeg-master-latest-$Platform-gpl.zip"
$url = "$baseUrl/$archive"
$outDir = Join-Path $PSScriptRoot "..\resources"
$outZip = Join-Path $env:TEMP $archive

Write-Host "Downloading ffmpeg for $Platform..." -ForegroundColor Cyan
Write-Host "URL: $url"

try {
  $wc = New-Object System.Net.WebClient
  $wc.DownloadFile($url, $outZip)
} catch {
  Write-Host "Failed: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Write-Host "Extracting ffmpeg.exe..."
try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($outZip)
  $entry = $zip.Entries | Where-Object { $_.Name -eq "ffmpeg.exe" } | Select-Object -First 1
  if (-not $entry) {
    Write-Host "ffmpeg.exe not found in archive" -ForegroundColor Red
    $zip.Dispose()
    exit 1
  }
  $outPath = Join-Path $outDir "ffmpeg.exe"
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outPath, $true)
  $zip.Dispose()
  Write-Host "Extracted to: $outPath" -ForegroundColor Green
} catch {
  Write-Host "Failed to extract: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

Remove-Item $outZip -Force
Write-Host "Done." -ForegroundColor Green

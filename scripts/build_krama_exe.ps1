$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

$nodeCommand = Get-Command node -ErrorAction Stop
$distDir = Join-Path $repoRoot "dist"
$tempDir = Join-Path $repoRoot ".build"
$seaConfigPath = Join-Path $tempDir "sea-config.json"
$seaBlobPath = Join-Path $tempDir "sea-prep.blob"
$bootstrapPath = Join-Path $repoRoot "scripts\krama_sea_bootstrap.cjs"
$scraperPath = Join-Path $repoRoot "scrape_krama.js"
$outputPath = Join-Path $distDir "krama-sync.exe"
$envExamplePath = Join-Path $repoRoot ".env.example"
$releaseReadmePath = Join-Path $repoRoot "RELEASE_README.txt"
$postjectPath = Join-Path $repoRoot "node_modules\.bin\postject.cmd"
$sentinelFuse = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
$playwrightCacheDir = Join-Path $env:LOCALAPPDATA "ms-playwright"

if (-not (Test-Path $postjectPath)) {
  throw "Missing postject. Run npm install before building the executable."
}

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

$seaConfig = @{
  main = $bootstrapPath
  output = $seaBlobPath
  disableExperimentalSEAWarning = $true
  useCodeCache = $false
  assets = @{
    "scrape_krama.js" = $scraperPath
  }
}

$seaConfigJson = $seaConfig | ConvertTo-Json
[System.IO.File]::WriteAllText($seaConfigPath, $seaConfigJson, [System.Text.UTF8Encoding]::new($false))

& $nodeCommand.Source "--experimental-sea-config" $seaConfigPath
if ($LASTEXITCODE -ne 0) {
  throw "SEA blob generation failed with code $LASTEXITCODE"
}

Copy-Item -LiteralPath $nodeCommand.Source -Destination $outputPath -Force

& $postjectPath $outputPath NODE_SEA_BLOB $seaBlobPath --sentinel-fuse $sentinelFuse
if ($LASTEXITCODE -ne 0) {
  throw "SEA injection failed with code $LASTEXITCODE"
}

$runtimeNodeModulesDir = Join-Path $distDir "node_modules"
if (Test-Path $runtimeNodeModulesDir) {
  Remove-Item -LiteralPath $runtimeNodeModulesDir -Recurse -Force
}
New-Item -ItemType Directory -Path $runtimeNodeModulesDir -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "node_modules\playwright") -Destination $runtimeNodeModulesDir -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "node_modules\playwright-core") -Destination $runtimeNodeModulesDir -Recurse -Force

$distRuntimeDirs = @(
  (Join-Path $distDir "logs")
)

$legacyOutputDir = Join-Path $distDir "output"
if (Test-Path $legacyOutputDir) {
  Remove-Item -LiteralPath $legacyOutputDir -Recurse -Force
}

foreach ($runtimeDir in $distRuntimeDirs) {
  if (-not (Test-Path $runtimeDir)) {
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  }
}

$distBrowserDir = Join-Path $distDir "ms-playwright"
if (Test-Path $distBrowserDir) {
  Remove-Item -LiteralPath $distBrowserDir -Recurse -Force
}
if (Test-Path $playwrightCacheDir) {
  Copy-Item -LiteralPath $playwrightCacheDir -Destination $distBrowserDir -Recurse -Force
} else {
  Write-Warning "Playwright browser cache was not found at $playwrightCacheDir. The executable will need browser assets before the fallback mode can run."
}

if (Test-Path $envExamplePath) {
  Copy-Item -LiteralPath $envExamplePath -Destination (Join-Path $distDir ".env.example") -Force
}
if (Test-Path $releaseReadmePath) {
  Copy-Item -LiteralPath $releaseReadmePath -Destination (Join-Path $distDir "README.txt") -Force
}

Write-Host "Built executable: $outputPath"
Write-Host "Dist folder contents now include the exe, Playwright runtime files, logs, and README."

param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installMarker = Join-Path $repoRoot "node_modules\.modules.yaml"

if ((Test-Path $installMarker) -and -not $Force) {
  Write-Host "Dependencias ya instaladas. Usa -Force si quieres reinstalar."
  exit 0
}

Write-Host "Instalando dependencias del workspace..."
Push-Location $repoRoot
try {
  $previousCi = $env:CI
  $env:CI = "true"
  Invoke-WorkspacePnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm install failed with exit code $LASTEXITCODE"
  }
}
finally {
  $env:CI = $previousCi
  Pop-Location
}

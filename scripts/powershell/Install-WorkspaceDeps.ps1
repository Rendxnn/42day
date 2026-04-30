param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

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
  corepack pnpm install --frozen-lockfile
}
finally {
  $env:CI = $previousCi
  Pop-Location
}

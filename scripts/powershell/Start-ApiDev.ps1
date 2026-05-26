$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$wranglerCmd = Join-Path $repoRoot "apps\api\node_modules\.bin\wrangler.cmd"

if (-not (Test-Path $wranglerCmd)) {
  Write-Host "No encontre wrangler.cmd. Reparando dependencias desde scripts..."
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1") -Force
}

Write-Host "Levantando API local..."
Push-Location $repoRoot
try {
  corepack pnpm --filter @42day/api dev
}
finally {
  Pop-Location
}

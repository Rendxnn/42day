$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$wranglerCmd = Join-Path $repoRoot "apps\api\node_modules\.bin\wrangler.cmd"

if (-not (Test-Path $wranglerCmd)) {
  Write-Host "No encontre wrangler.cmd. Reparando dependencias desde scripts..."
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1") -Force
}

Write-Host "Levantando API local..."
Push-Location $repoRoot
try {
  Invoke-WorkspacePnpm --filter @42day/api dev
  if ($LASTEXITCODE -ne 0) {
    throw "api dev failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

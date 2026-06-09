$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$viteCmd = Join-Path $repoRoot "apps\dashboard\node_modules\.bin\vite.cmd"

if (-not (Test-Path $viteCmd)) {
  Write-Host "No encontre vite.cmd. Reparando dependencias desde scripts..."
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1") -Force
}

Write-Host "Levantando dashboard local..."
Push-Location $repoRoot
try {
  Invoke-WorkspacePnpm --filter @42day/dashboard dev
  if ($LASTEXITCODE -ne 0) {
    throw "dashboard dev failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

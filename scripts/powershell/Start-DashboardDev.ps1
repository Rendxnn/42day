$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$viteCmd = Join-Path $repoRoot "apps\dashboard\node_modules\.bin\vite.cmd"

if (-not (Test-Path $viteCmd)) {
  Write-Host "No encontre vite.cmd. Reparando dependencias desde scripts..."
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1") -Force
}

Write-Host "Levantando dashboard local..."
Push-Location $repoRoot
try {
  corepack pnpm --filter @42day/dashboard dev
}
finally {
  Pop-Location
}

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$viteCmd = Join-Path $repoRoot "apps\dashboard\node_modules\.bin\vite.cmd"
$wranglerCmd = Join-Path $repoRoot "apps\api\node_modules\.bin\wrangler.cmd"

Write-Host "Verificando dependencias del workspace..."
if ((Test-Path $viteCmd) -and (Test-Path $wranglerCmd)) {
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1")
}
else {
  Write-Host "Faltan binarios .cmd de Windows. Reinstalando dependencias..."
  & (Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1") -Force
}

Write-Host "Abriendo dos ventanas PowerShell: API y dashboard..."

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$repoRoot'; .\scripts\powershell\Start-ApiDev.ps1"
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$repoRoot'; .\scripts\powershell\Start-DashboardDev.ps1"
)

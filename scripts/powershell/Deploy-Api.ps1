param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

Write-Host "Desplegando API en Cloudflare Worker ($Environment)..."
$apiWrangler = Join-Path $PSScriptRoot "..\..\apps\api\node_modules\.bin\wrangler.cmd"
if (-not (Test-Path $apiWrangler)) {
  throw "Wrangler no esta instalado para Windows. Ejecuta .\scripts\powershell\Install-WorkspaceDeps.ps1 -Force desde PowerShell antes de desplegar. No reutilices node_modules instalado desde WSL."
}
Invoke-WorkspacePnpm --filter @42day/api exec wrangler deploy --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler deploy failed with exit code $LASTEXITCODE"
}

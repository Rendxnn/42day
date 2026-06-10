param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")
$installScript = Join-Path $PSScriptRoot "Install-WorkspaceDeps.ps1"

Write-Host "Desplegando API en Cloudflare Worker ($Environment)..."
& $installScript
if ($LASTEXITCODE -ne 0) {
  throw "workspace dependency install failed with exit code $LASTEXITCODE"
}

Invoke-WorkspacePnpm --filter @42day/api exec wrangler deploy --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler deploy failed with exit code $LASTEXITCODE"
}

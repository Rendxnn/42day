param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

Write-Host "Desplegando API en Cloudflare Worker ($Environment)..."
Invoke-WorkspacePnpm --filter @42day/api exec wrangler deploy --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler deploy failed with exit code $LASTEXITCODE"
}

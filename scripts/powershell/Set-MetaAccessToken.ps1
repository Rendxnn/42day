param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

Write-Host "Actualizando META_ACCESS_TOKEN en Cloudflare Worker ($Environment)..."
Invoke-WorkspacePnpm --filter @42day/api exec wrangler secret put META_ACCESS_TOKEN --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler secret put failed with exit code $LASTEXITCODE"
}

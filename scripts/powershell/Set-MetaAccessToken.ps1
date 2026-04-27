param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

Write-Host "Actualizando META_ACCESS_TOKEN en Cloudflare Worker ($Environment)..."
corepack pnpm --filter @42day/api exec wrangler secret put META_ACCESS_TOKEN --env $Environment

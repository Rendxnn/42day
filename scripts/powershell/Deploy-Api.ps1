param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

Write-Host "Desplegando API en Cloudflare Worker ($Environment)..."
corepack pnpm --filter @42day/api exec wrangler deploy --env $Environment

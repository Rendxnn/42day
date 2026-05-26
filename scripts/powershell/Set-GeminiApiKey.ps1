param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

Write-Host "Actualizando GEMINI_API_KEY en Cloudflare Worker ($Environment)..."
corepack pnpm --filter @42day/api exec wrangler secret put GEMINI_API_KEY --env $Environment

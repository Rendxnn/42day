param(
  [string]$Environment = "staging",

  [ValidateSet("pretty", "json")]
  [string]$Format = "pretty"
)

$ErrorActionPreference = "Stop"

Write-Host "Abriendo tail de logs para Cloudflare Worker ($Environment) en formato $Format..."
corepack pnpm --filter @42day/api exec wrangler tail --env $Environment --format $Format

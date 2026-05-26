param(
  [Parameter(Mandatory = $true)]
  [string]$SecretName,

  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

Write-Host "Configurando secret $SecretName en Cloudflare Worker ($Environment)..."
corepack pnpm --filter @42day/api exec wrangler secret put $SecretName --env $Environment

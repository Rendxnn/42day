param(
  [Parameter(Mandatory = $true)]
  [string]$SecretName,

  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

Write-Host "Configurando secret $SecretName en Cloudflare Worker ($Environment)..."
Invoke-WorkspacePnpm --filter @42day/api exec wrangler secret put $SecretName --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler secret put failed with exit code $LASTEXITCODE"
}

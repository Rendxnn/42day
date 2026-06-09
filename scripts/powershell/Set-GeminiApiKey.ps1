param(
  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

Write-Host "Actualizando GEMINI_API_KEY en Cloudflare Worker ($Environment)..."
Invoke-WorkspacePnpm --filter @42day/api exec wrangler secret put GEMINI_API_KEY --env $Environment
if ($LASTEXITCODE -ne 0) {
  throw "wrangler secret put failed with exit code $LASTEXITCODE"
}

param(
  [Parameter(Mandatory = $true)]
  [string]$PhoneNumberId,

  [Parameter(Mandatory = $true)]
  [string]$WabaId,

  [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

$phoneNumberIdValue = $PhoneNumberId.Trim()
$wabaIdValue = $WabaId.Trim()

if ([string]::IsNullOrWhiteSpace($phoneNumberIdValue)) {
  throw "PhoneNumberId no puede estar vacio."
}

if ([string]::IsNullOrWhiteSpace($wabaIdValue)) {
  throw "WabaId no puede estar vacio."
}

Write-Host "Actualizando META_PHONE_NUMBER_ID en Cloudflare Worker ($Environment)..."
$phoneNumberIdValue | corepack pnpm --filter @42day/api exec wrangler secret put META_PHONE_NUMBER_ID --env $Environment

Write-Host "Actualizando META_WABA_ID en Cloudflare Worker ($Environment)..."
$wabaIdValue | corepack pnpm --filter @42day/api exec wrangler secret put META_WABA_ID --env $Environment

Write-Host "Secrets actualizados: META_PHONE_NUMBER_ID y META_WABA_ID."

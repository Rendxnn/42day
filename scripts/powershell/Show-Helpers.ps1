$ErrorActionPreference = "Stop"

$scriptsPath = Join-Path $PSScriptRoot "*.ps1"

$descriptions = @{
  "Show-Helpers.ps1" = "Lista los helpers disponibles."
  "Set-CfWorkerSecret.ps1" = "Actualiza cualquier secret del Worker."
  "Set-MetaAccessToken.ps1" = "Actualiza META_ACCESS_TOKEN en Cloudflare."
  "Set-GeminiApiKey.ps1" = "Actualiza GEMINI_API_KEY en Cloudflare."
  "Deploy-Api.ps1" = "Despliega la API a Cloudflare."
  "Test-ApiHealth.ps1" = "Prueba /health del Worker desplegado."
  "Start-ApiDev.ps1" = "Levanta la API local con Wrangler."
  "Start-DashboardDev.ps1" = "Levanta el dashboard local con Vite."
  "Start-LocalStack.ps1" = "Abre dos ventanas PowerShell: API y dashboard."
  "Publish-Staging.ps1" = "Deploy de staging y prueba de health."
}

Get-ChildItem $scriptsPath |
  Sort-Object Name |
  Select-Object Name, @{ Name = "Description"; Expression = { $descriptions[$_.Name] } } |
  Format-Table -AutoSize

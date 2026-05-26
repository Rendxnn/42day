param(
  [string]$BaseUrl = "https://42day-api-staging.42day.workers.dev"
)

$ErrorActionPreference = "Stop"

Write-Host "Probando health en $BaseUrl/health ..."
Invoke-WebRequest -Uri "$BaseUrl/health" | Select-Object -ExpandProperty Content

param(
  [switch]$SkipHealthCheck
)

$ErrorActionPreference = "Stop"

Write-Host "Desplegando staging..."
.\scripts\powershell\Deploy-Api.ps1 -Environment staging

if (-not $SkipHealthCheck) {
  Write-Host "Probando health de staging..."
  .\scripts\powershell\Test-ApiHealth.ps1 -BaseUrl "https://42day-api-staging.42day.workers.dev"
}

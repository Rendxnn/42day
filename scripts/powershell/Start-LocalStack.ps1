$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "Abriendo dos ventanas PowerShell: API y dashboard..."

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$repoRoot'; .\scripts\powershell\Start-ApiDev.ps1"
)

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$repoRoot'; .\scripts\powershell\Start-DashboardDev.ps1"
)

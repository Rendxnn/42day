$ErrorActionPreference = "Stop"

Write-Host "Levantando API local..."
corepack pnpm --filter @42day/api dev

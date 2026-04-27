$ErrorActionPreference = "Stop"

Write-Host "Levantando dashboard local..."
corepack pnpm --filter @42day/dashboard dev

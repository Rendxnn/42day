param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "Resolve-Pnpm.ps1")

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installMarker = Join-Path $repoRoot "node_modules\.modules.yaml"

function Test-WorkspaceInstallStale {
  param(
    [string]$RootPath,
    [string]$MarkerPath
  )

  if (-not (Test-Path $MarkerPath)) {
    return $true
  }

  $markerTimestamp = (Get-Item $MarkerPath).LastWriteTimeUtc
  $pathsToCheck = @(
    (Join-Path $RootPath "package.json"),
    (Join-Path $RootPath "pnpm-lock.yaml"),
    (Join-Path $RootPath "pnpm-workspace.yaml")
  )

  $workspacePackageFiles = Get-ChildItem -Path $RootPath -Recurse -Filter package.json -File |
    Where-Object {
      $_.FullName -notlike "*\node_modules\*" -and
      $_.FullName -notlike "*\.turbo\*" -and
      $_.FullName -notlike "*\.wrangler\*"
    }

  $pathsToCheck += $workspacePackageFiles.FullName

  foreach ($path in $pathsToCheck | Select-Object -Unique) {
    if ((Test-Path $path) -and (Get-Item $path).LastWriteTimeUtc -gt $markerTimestamp) {
      return $true
    }
  }

  return $false
}

$needsInstall = Test-WorkspaceInstallStale -RootPath $repoRoot -MarkerPath $installMarker

if (-not $needsInstall -and -not $Force) {
  Write-Host "Dependencias ya instaladas. Usa -Force si quieres reinstalar."
  exit 0
}

Write-Host "Instalando dependencias del workspace..."
Push-Location $repoRoot
try {
  $previousCi = $env:CI
  $env:CI = "true"
  Invoke-WorkspacePnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm install failed with exit code $LASTEXITCODE"
  }
}
finally {
  $env:CI = $previousCi
  Pop-Location
}

$ErrorActionPreference = "Stop"

function Invoke-WorkspacePnpm {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  $pnpmCommand = Get-Command pnpm -ErrorAction SilentlyContinue

  if ($pnpmCommand) {
    & pnpm @Arguments
    return
  }

  & corepack pnpm @Arguments
}

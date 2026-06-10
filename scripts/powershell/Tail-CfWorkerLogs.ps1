param(
  [string]$Environment = "staging",

  [ValidateSet("summary", "errors", "llm", "state", "raw", "pretty", "json")]
  [string]$View = "summary",

  [string]$Search,

  [string]$TraceId,

  [string]$ConversationId,

  [string]$Tenant,

  [int]$SinceMinutes = 0,

  [switch]$ShowRequest
)

$ErrorActionPreference = "Stop"

function Get-TimestampText {
  param($EventRecord)

  $rawTimestamp = $EventRecord.eventTimestamp
  if (-not $rawTimestamp) {
    return (Get-Date).ToString("HH:mm:ss.fff")
  }

  try {
    return ([DateTimeOffset]::Parse($rawTimestamp).ToLocalTime()).ToString("HH:mm:ss.fff")
  } catch {
    return [string]$rawTimestamp
  }
}

function Get-EventDateTimeOffset {
  param($EventRecord)

  $rawTimestamp = $EventRecord.eventTimestamp
  if (-not $rawTimestamp) {
    return $null
  }

  try {
    return [DateTimeOffset]::Parse($rawTimestamp)
  } catch {
    return $null
  }
}

function Get-RequestSummary {
  param($EventRecord)

  $request = $EventRecord.event.request
  if (-not $request) {
    return $null
  }

  $method = if ($request.method) { [string]$request.method } else { "?" }
  $urlText = [string]$request.url
  if (-not $urlText) {
    return $method
  }

  try {
    $uri = [Uri]$urlText
    return "$method $($uri.PathAndQuery)"
  } catch {
    return "$method $urlText"
  }
}

function Convert-ValueToText {
  param($Value)

  if ($null -eq $Value) {
    return ""
  }

  if ($Value -is [string] -or $Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [bool]) {
    return [string]$Value
  }

  if ($Value -is [System.Array]) {
    return (($Value | ForEach-Object { Convert-ValueToText -Value $_ }) -join " ")
  }

  return ($Value | ConvertTo-Json -Compress -Depth 12)
}

function Truncate-Text {
  param(
    [string]$Text,
    [int]$MaxLength = 160
  )

  if (-not $Text) {
    return ""
  }

  if ($Text.Length -le $MaxLength) {
    return $Text
  }

  return "$($Text.Substring(0, $MaxLength))…(+$($Text.Length - $MaxLength) chars)"
}

function Get-ShortId {
  param([string]$Value)

  if (-not $Value) {
    return "-"
  }

  if ($Value.Length -le 8) {
    return $Value
  }

  return $Value.Substring(0, 8)
}

function Try-GetAppEvent {
  param($LogRecord)

  $message = $LogRecord.message
  if ($message -isnot [System.Array] -or $message.Length -lt 2) {
    return $null
  }

  $label = Convert-ValueToText -Value $message[0]
  if ($label -ne "app_event" -and $label -ne "app_event_raw") {
    return $null
  }

  $payload = $message[1]
  if (-not $payload) {
    return $null
  }

  return [PSCustomObject]@{
    kind = $label
    payload = $payload
    level = if ($LogRecord.level) { [string]$LogRecord.level } else { "info" }
  }
}

function Matches-AppEventFilters {
  param(
    $AppEvent,
    [string]$TraceIdFilter,
    [string]$ConversationIdFilter,
    [string]$TenantFilter,
    [string]$SearchPattern
  )

  $payload = $AppEvent.payload

  if ($TraceIdFilter -and [string]$payload.traceId -ne $TraceIdFilter) {
    return $false
  }

  if ($ConversationIdFilter -and [string]$payload.conversationId -ne $ConversationIdFilter) {
    return $false
  }

  if ($TenantFilter -and [string]$payload.tenant -ne $TenantFilter) {
    return $false
  }

  if ($SearchPattern) {
    $haystack = @(
      [string]$payload.eventName,
      [string]$payload.reasonCode,
      [string]$payload.preview,
      [string]$payload.provider,
      [string]$payload.model,
      [string]$payload.traceId,
      [string]$payload.conversationId
    ) -join " "

    if ($haystack -notmatch $SearchPattern) {
      return $false
    }
  }

  return $true
}

function Matches-View {
  param(
    $AppEvent,
    [string]$SelectedView
  )

  $eventName = [string]$AppEvent.payload.eventName

  switch ($SelectedView) {
    "summary" { return $AppEvent.kind -eq "app_event" }
    "errors" { return $eventName -eq "llm.error" -or $AppEvent.level -in @("error", "fatal", "warn") }
    "llm" { return $eventName -like "llm.*" }
    "state" { return $eventName -like "state.*" }
    "raw" { return $true }
    default { return $true }
  }
}

function Format-AppEventLine {
  param(
    [string]$Timestamp,
    $AppEvent
  )

  $payload = $AppEvent.payload
  $parts = @(
    "[$Timestamp]",
    [string]$payload.eventName,
    "trace=$(Get-ShortId -Value ([string]$payload.traceId))",
    "conv=$(Get-ShortId -Value ([string]$payload.conversationId))"
  )

  if ($payload.provider) {
    $parts += "provider=$([string]$payload.provider)"
  }

  if ($payload.model) {
    $parts += "model=$([string]$payload.model)"
  }

  if ($payload.attempt) {
    $parts += "attempt=$([string]$payload.attempt)"
  }

  if ($payload.route) {
    $parts += "route=$([string]$payload.route)"
  }

  if ($payload.reasonCode) {
    $parts += "reason=$([string]$payload.reasonCode)"
  }

  if ($payload.errorClass) {
    $parts += "class=$([string]$payload.errorClass)"
  }

  if ($payload.latencyMs) {
    $parts += "latency=$([string]$payload.latencyMs)ms"
  }

  if ($payload.inputTokens -or $payload.outputTokens) {
    $parts += "tokens=$([string]$payload.inputTokens)/$([string]$payload.outputTokens)"
  }

  if ($payload.preview) {
    $parts += "preview=$(Truncate-Text -Text ([string]$payload.preview) -MaxLength 120)"
  }

  return Truncate-Text -Text ($parts -join " ") -MaxLength 220
}

function Write-GenericLogLine {
  param(
    [string]$Timestamp,
    $LogRecord
  )

  $level = if ($LogRecord.level) { [string]$LogRecord.level } else { "info" }
  $color = switch ($level.ToLowerInvariant()) {
    "debug" { "DarkGray" }
    "warn" { "Yellow" }
    "error" { "Red" }
    "fatal" { "Red" }
    default { "Gray" }
  }

  $text = Convert-ValueToText -Value $LogRecord.message
  if (-not $text) {
    return
  }

  Write-Host "[$Timestamp] [$level] $(Truncate-Text -Text $text -MaxLength 220)" -ForegroundColor $color
}

function Process-EventRecord {
  param(
    $EventRecord,
    [string]$SelectedView,
    [string]$SearchPattern,
    [string]$TraceIdFilter,
    [string]$ConversationIdFilter,
    [string]$TenantFilter,
    $Cutoff,
    [bool]$IncludeRequest
  )

  if ($Cutoff) {
    $eventTime = Get-EventDateTimeOffset -EventRecord $EventRecord
    if ($eventTime -and $eventTime -lt $Cutoff) {
      return
    }
  }

  $timestamp = Get-TimestampText -EventRecord $EventRecord
  $requestSummary = Get-RequestSummary -EventRecord $EventRecord
  $headerPrinted = $false

  foreach ($logRecord in @($EventRecord.logs)) {
    $appEvent = Try-GetAppEvent -LogRecord $logRecord
    if ($appEvent) {
      if (-not (Matches-AppEventFilters -AppEvent $appEvent -TraceIdFilter $TraceIdFilter -ConversationIdFilter $ConversationIdFilter -TenantFilter $TenantFilter -SearchPattern $SearchPattern)) {
        continue
      }

      if (-not (Matches-View -AppEvent $appEvent -SelectedView $SelectedView)) {
        continue
      }

      if ($IncludeRequest -and -not $headerPrinted -and $requestSummary) {
        Write-Host ""
        Write-Host "[$timestamp] $requestSummary" -ForegroundColor Cyan
        $headerPrinted = $true
      }

      if ($SelectedView -eq "raw") {
        $rawJson = $appEvent.payload | ConvertTo-Json -Compress -Depth 12
        Write-Host "[$timestamp] $rawJson" -ForegroundColor DarkGray
        continue
      }

      $color = switch ($appEvent.level.ToLowerInvariant()) {
        "warn" { "Yellow" }
        "error" { "Red" }
        "fatal" { "Red" }
        default { "Gray" }
      }
      Write-Host (Format-AppEventLine -Timestamp $timestamp -AppEvent $appEvent) -ForegroundColor $color
      continue
    }

    if ($SelectedView -eq "raw") {
      if ($IncludeRequest -and -not $headerPrinted -and $requestSummary) {
        Write-Host ""
        Write-Host "[$timestamp] $requestSummary" -ForegroundColor Cyan
        $headerPrinted = $true
      }

      Write-GenericLogLine -Timestamp $timestamp -LogRecord $logRecord
    }
  }

  if ($SelectedView -eq "raw") {
    foreach ($exceptionRecord in @($EventRecord.exceptions)) {
      $exceptionText = Convert-ValueToText -Value @($exceptionRecord.name, $exceptionRecord.message)
      if ($SearchPattern -and $exceptionText -notmatch $SearchPattern) {
        continue
      }

      if ($IncludeRequest -and -not $headerPrinted -and $requestSummary) {
        Write-Host ""
        Write-Host "[$timestamp] $requestSummary" -ForegroundColor Cyan
        $headerPrinted = $true
      }

      Write-Host "[$timestamp] [exception] $(Truncate-Text -Text $exceptionText -MaxLength 220)" -ForegroundColor Red
    }
  }
}

Write-Host "Abriendo tail de logs para Cloudflare Worker ($Environment) en vista $View..."

if ($View -eq "pretty" -or $View -eq "json") {
  corepack pnpm --filter @42day/api exec wrangler tail --env $Environment --format $View
  exit $LASTEXITCODE
}

$cutoff = if ($SinceMinutes -gt 0) { [DateTimeOffset]::Now.AddMinutes(-1 * $SinceMinutes) } else { $null }
$jsonBuffer = ""

corepack pnpm --filter @42day/api exec wrangler tail --env $Environment --format json |
  ForEach-Object {
    $line = [string]$_
    if (-not $line.Trim()) {
      return
    }

    $trimmed = $line.Trim()
    if (-not $jsonBuffer -and -not $trimmed.StartsWith("{")) {
      Write-Host $line -ForegroundColor DarkGray
      return
    }

    if ($jsonBuffer) {
      $jsonBuffer = "$jsonBuffer`n$line"
    } else {
      $jsonBuffer = $line
    }

    try {
      $eventRecord = $jsonBuffer | ConvertFrom-Json
    } catch {
      return
    }

    $jsonBuffer = ""
    Process-EventRecord -EventRecord $eventRecord -SelectedView $View -SearchPattern $Search -TraceIdFilter $TraceId -ConversationIdFilter $ConversationId -TenantFilter $Tenant -Cutoff $cutoff -IncludeRequest:$ShowRequest
  }

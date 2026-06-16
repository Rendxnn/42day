#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

declare -A descriptions=(
  ["Show-Helpers.sh"]="Lists the available helpers."
  ["Install-WorkspaceDeps.sh"]="Installs or repairs workspace dependencies."
  ["Set-CfWorkerSecret.sh"]="Updates any Cloudflare Worker secret."
  ["Set-MetaAccessToken.sh"]="Updates META_ACCESS_TOKEN in Cloudflare."
  ["Set-MetaPhoneNumberId.sh"]="Updates META_PHONE_NUMBER_ID in Cloudflare."
  ["Set-GeminiApiKey.sh"]="Updates GEMINI_API_KEY in Cloudflare."
  ["Deploy-Api.sh"]="Deploys the API to Cloudflare."
  ["Test-ApiHealth.sh"]="Tests the deployed Worker /health endpoint."
  ["Start-ApiDev.sh"]="Starts the API locally with Wrangler."
  ["Start-DashboardDev.sh"]="Starts the dashboard locally with Vite."
  ["Start-LocalStack.sh"]="Starts API and dashboard for local dev."
  ["Tail-WorkerLogs.sh"]="Tails Cloudflare Worker logs in real time."
  ["Publish-Staging.sh"]="Deploys staging and runs the health check."
  ["Publish-Production.sh"]="Deploys production and runs the health check."
)

for helper in "$script_dir"/*.sh; do
  name="$(basename "$helper")"
  [[ "$name" == "lib.sh" ]] && continue
  printf '%-28s %s\n' "$name" "${descriptions[$name]:-}"
done | sort

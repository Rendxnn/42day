#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

base_url="https://42day-api-production.42day.workers.dev"
skip_health_check=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url|-u)
      base_url="${2:?Missing base URL}"
      shift 2
      ;;
    --skip-health-check)
      skip_health_check=1
      shift
      ;;
    *)
      die "Usage: $0 [--base-url https://...] [--skip-health-check]"
      ;;
  esac
done

root="$(repo_root)"
ensure_repo_root "$root"

printf 'Deploying production...\n'
"$script_dir/Deploy-Api.sh" --environment production

if [[ $skip_health_check -eq 0 ]]; then
  printf 'Testing production health...\n'
  "$script_dir/Test-ApiHealth.sh" --base-url "$base_url"
fi

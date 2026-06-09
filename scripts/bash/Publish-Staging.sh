#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

skip_health_check=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-health-check)
      skip_health_check=1
      shift
      ;;
    *)
      die "Usage: $0 [--skip-health-check]"
      ;;
  esac
done

root="$(repo_root)"
ensure_repo_root "$root"

printf 'Deploying staging...\n'
"$script_dir/Deploy-Api.sh" --environment staging

if [[ $skip_health_check -eq 0 ]]; then
  printf 'Testing staging health...\n'
  "$script_dir/Test-ApiHealth.sh" --base-url "https://42day-api-staging.42day.workers.dev"
fi

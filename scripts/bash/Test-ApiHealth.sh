#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

base_url="https://42day-api-staging.42day.workers.dev"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url|-u)
      base_url="${2:?Missing base URL}"
      shift 2
      ;;
    *)
      die "Usage: $0 [--base-url https://...]"
      ;;
  esac
done

if [[ -z "$base_url" ]]; then
  die "Base URL cannot be empty"
fi

printf 'Testing health at %s/health ...\n' "$base_url"
curl -fsS "$base_url/health"

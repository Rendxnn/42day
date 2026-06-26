#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

environment="staging"
worker_name="42day-api"
tail_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment|-e)
      environment="${2:?Missing environment value}"
      shift 2
      ;;
    --worker-name|-w)
      worker_name="${2:?Missing worker name}"
      shift 2
      ;;
    --format|--status|--method|--header|--sampling-rate|--search|--ip|--version-id)
      tail_args+=("$1" "${2:?Missing value for $1}")
      shift 2
      ;;
    --)
      shift
      tail_args+=("$@")
      break
      ;;
    *)
      tail_args+=("$1")
      shift
      ;;
  esac
done

root="$(repo_root)"
ensure_repo_root "$root"

printf 'Tailing logs for %s (%s)...\n' "$worker_name" "$environment"
(
  cd "$root/apps/api"
  cmd=(exec wrangler tail "$worker_name" --env "$environment" --format pretty)
  if [[ ${#tail_args[@]} -gt 0 ]]; then
    cmd+=("${tail_args[@]}")
  fi
  pnpm_exec "${cmd[@]}"
)

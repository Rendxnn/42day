#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

environment="staging"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment|-e)
      environment="${2:?Missing environment value}"
      shift 2
      ;;
    *)
      die "Usage: $0 [--environment staging|production]"
      ;;
  esac
done

root="$(repo_root)"
ensure_repo_root "$root"

printf 'Updating META_PHONE_NUMBER_ID in Cloudflare Worker (%s)...\n' "$environment"
(
  cd "$root"
  pnpm_exec --filter @42day/api exec wrangler secret put META_PHONE_NUMBER_ID --env "$environment"
)

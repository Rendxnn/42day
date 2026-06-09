#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

secret_name="${1:-}"
if [[ -z "$secret_name" ]]; then
  die "Usage: $0 SECRET_NAME [--environment staging|production]"
fi

shift
environment="staging"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --environment|-e)
      environment="${2:?Missing environment value}"
      shift 2
      ;;
    *)
      die "Usage: $0 SECRET_NAME [--environment staging|production]"
      ;;
  esac
done

root="$(repo_root)"
ensure_repo_root "$root"

printf 'Configuring secret %s in Cloudflare Worker (%s)...\n' "$secret_name" "$environment"
(
  cd "$root"
  pnpm_exec --filter @42day/api exec wrangler secret put "$secret_name" --env "$environment"
)

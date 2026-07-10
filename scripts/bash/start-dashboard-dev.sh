#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

root="$(repo_root)"
ensure_repo_root "$root"

if [[ ! -f "$root/node_modules/.modules.yaml" ]]; then
  printf 'No workspace install found. Reinstalling dependencies...\n'
  "$script_dir/install-workspace-deps.sh" --force
fi

printf 'Starting dashboard locally...\n'
(
  cd "$root"
  pnpm_exec --filter @42day/dashboard dev
)

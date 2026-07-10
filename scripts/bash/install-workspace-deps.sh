#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

force=0
if [[ ${1:-} == "--force" || ${1:-} == "-f" ]]; then
  force=1
  shift
fi

[[ $# -eq 0 ]] || die "Usage: $0 [--force]"

root="$(repo_root)"
ensure_repo_root "$root"

install_marker="$root/node_modules/.modules.yaml"
if [[ -f "$install_marker" && $force -eq 0 ]]; then
  printf 'Dependencies already installed. Use --force to reinstall.\n'
  exit 0
fi

printf 'Installing workspace dependencies...\n'
(
  cd "$root"
  CI=true pnpm_exec install --frozen-lockfile
)

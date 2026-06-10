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

workspace_install_stale() {
  [[ ! -f "$install_marker" ]] && return 0

  local marker_epoch
  marker_epoch="$(stat -c %Y "$install_marker")"

  while IFS= read -r path; do
    [[ -e "$path" ]] || continue
    if [[ "$(stat -c %Y "$path")" -gt "$marker_epoch" ]]; then
      return 0
    fi
  done < <(
    {
      printf '%s\n' "$root/package.json" "$root/pnpm-lock.yaml" "$root/pnpm-workspace.yaml"
      find "$root" -path '*/node_modules/*' -prune -o -path '*/.turbo/*' -prune -o -path '*/.wrangler/*' -prune -o -name package.json -type f -print
    } | awk '!seen[$0]++'
  )

  return 1
}

if workspace_install_stale; then
  :
elif [[ $force -eq 0 ]]; then
  printf 'Dependencies already installed. Use --force to reinstall.\n'
  exit 0
fi

printf 'Installing workspace dependencies...\n'
(
  cd "$root"
  CI=true pnpm_exec install --frozen-lockfile
)

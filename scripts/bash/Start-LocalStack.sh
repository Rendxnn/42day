#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$script_dir/lib.sh"

root="$(repo_root)"
ensure_repo_root "$root"
ensure_api_dev_vars "$root"

if [[ ! -f "$root/node_modules/.modules.yaml" ]]; then
  printf 'No workspace install found. Reinstalling dependencies...\n'
  "$script_dir/Install-WorkspaceDeps.sh" --force
fi

launch_terminal() {
  local title="$1"
  local command="$2"

  if command -v gnome-terminal >/dev/null 2>&1; then
    gnome-terminal --title="$title" -- bash -lc "$command; exec bash"
    return 0
  fi

  if command -v x-terminal-emulator >/dev/null 2>&1; then
    x-terminal-emulator -T "$title" -e bash -lc "$command; exec bash"
    return 0
  fi

  printf 'No terminal emulator found. Starting in background instead.\n' >&2
  bash -lc "$command" >/tmp/42day-${title// /-}.log 2>/tmp/42day-${title// /-}.err.log &
}

printf 'Opening two terminals: API and dashboard...\n'
launch_terminal "42day API" "cd '$root' && '$script_dir/Start-ApiDev.sh'"
launch_terminal "42day dashboard" "cd '$root' && '$script_dir/Start-DashboardDev.sh'"

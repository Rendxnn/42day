#!/usr/bin/env bash

set -euo pipefail

script_dir() {
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd
}

repo_root() {
  cd -- "$(script_dir)/../.." && pwd
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

ensure_repo_root() {
  local root="$1"
  [[ -f "$root/package.json" ]] || die "Run this script from the repo checkout. Expected package.json near $root"
}

ensure_api_dev_vars() {
  local root="$1"
  local api_env="$root/apps/api/.dev.vars"
  local api_env_example="$root/apps/api/.dev.vars.example"

  if [[ -f "$api_env" ]]; then
    return 0
  fi

  if [[ -f "$api_env_example" ]]; then
    cp "$api_env_example" "$api_env"
    printf 'Created apps/api/.dev.vars from .dev.vars.example. Fill Supabase values before persisting data.\n'
    return 0
  fi

  printf 'Warning: apps/api/.dev.vars is missing.\n' >&2
}

pnpm_exec() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    if corepack pnpm --version >/dev/null 2>&1; then
      corepack pnpm "$@"
      return 0
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    npm exec --yes pnpm@9.15.0 -- "$@"
    return 0
  fi

  die "pnpm is not available. Install it with: npm install -g pnpm@9.15.0"
}

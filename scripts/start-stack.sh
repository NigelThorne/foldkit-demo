#!/bin/sh
set -eu

export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export MISE_TRUSTED_CONFIG_PATHS="$PWD/mise.toml"

mkdir -p .local-state
exec >>.local-state/stack-start.log 2>&1
printf '\nStarting local stack at %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

mise exec -- pnpm install --frozen-lockfile --prefer-offline
exec mise exec -- pnpm dev:shared

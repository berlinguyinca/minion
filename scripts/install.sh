#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_PATH="${MINION_CONFIG_PATH:-./config.yaml}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

cd "${ROOT_DIR}"

require_command git
require_command node

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Node.js 22+ is required. Found $(node -v)." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    echo "pnpm not found. Enabling via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
  fi
fi

require_command pnpm

echo "Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

echo "Building minion..."
pnpm build

echo "Launching onboarding..."
node dist/index.js --onboard --config "${CONFIG_PATH}"

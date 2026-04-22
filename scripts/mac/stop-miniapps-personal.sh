#!/bin/zsh

set -euo pipefail

REPO_ROOT="/Users/yusufemreatasayar/miniapps"
RUNTIME_ROOT="$REPO_ROOT/local-runtime"
LAUNCHER_FILE="$RUNTIME_ROOT/launcher.mjs"

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  EMBEDDED_NODE="$RUNTIME_ROOT/bin/node-macos-arm64"
else
  EMBEDDED_NODE="$RUNTIME_ROOT/bin/node-macos-x64"
fi

if [[ -x "$EMBEDDED_NODE" ]]; then
  NODE_CMD="$EMBEDDED_NODE"
elif [[ -x "/opt/homebrew/bin/node" ]]; then
  NODE_CMD="/opt/homebrew/bin/node"
elif [[ -x "/usr/local/bin/node" ]]; then
  NODE_CMD="/usr/local/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_CMD="$(command -v node)"
else
  osascript -e 'display alert "Miniapps" message "Node.js bulunamadı." as critical'
  exit 1
fi

"$NODE_CMD" "$LAUNCHER_FILE" stop

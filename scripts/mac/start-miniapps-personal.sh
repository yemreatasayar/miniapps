#!/bin/zsh

set -euo pipefail

REPO_ROOT="/Users/yusufemreatasayar/miniapps"
RUNTIME_ROOT="$REPO_ROOT/local-runtime"
LAUNCHER_FILE="$RUNTIME_ROOT/launcher.mjs"
PID_FILE="$RUNTIME_ROOT/.state/miniapps-launcher.pid"
LOG_FILE="$RUNTIME_ROOT/.state/launcher-bootstrap.log"
TARGET_URL="http://127.0.0.1:4310/"
OPEN_BROWSER="false"
ALLOW_UI="true"

if [[ "${1:-}" == "--open" ]]; then
  OPEN_BROWSER="true"
fi

if [[ "${MINIAPPS_NO_UI:-false}" == "true" ]]; then
  ALLOW_UI="false"
fi

mkdir -p "$RUNTIME_ROOT/.state"
printf '%s bootstrap invoked\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG_FILE"

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
  if [[ "$ALLOW_UI" == "true" ]]; then
    osascript -e 'display alert "Miniapps" message "Node.js bulunamadı." as critical'
  fi
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    printf '%s launcher already running with pid %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$EXISTING_PID" >>"$LOG_FILE"
    if [[ "$OPEN_BROWSER" == "true" ]]; then
      open "$TARGET_URL"
    fi
    exit 0
  fi
fi

printf '%s starting launcher via %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$NODE_CMD" >>"$LOG_FILE"
nohup "$NODE_CMD" "$LAUNCHER_FILE" start >>"$LOG_FILE" 2>&1 </dev/null &

for _ in {1..40}; do
  sleep 0.25
  if [[ -f "$PID_FILE" ]]; then
    STARTED_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$STARTED_PID" ]] && kill -0 "$STARTED_PID" 2>/dev/null; then
      printf '%s launcher ready with pid %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STARTED_PID" >>"$LOG_FILE"
      if [[ "$OPEN_BROWSER" == "true" ]]; then
        open "$TARGET_URL"
      fi
      exit 0
    fi
  fi
done

printf '%s launcher failed to produce pid file\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG_FILE"
if [[ "$ALLOW_UI" == "true" ]]; then
  osascript -e 'display alert "Miniapps" message "Miniapps başlatılamadı. local-runtime/.state içindeki logları kontrol et." as critical'
fi
exit 1

#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/Library/Application Support/miniapps/stem-helper"
PLIST_PATH="$HOME/Library/LaunchAgents/com.miniapps.stem-helper.plist"
PLIST_TEMPLATE="$SCRIPT_DIR/com.miniapps.stem-helper.plist.template"
RUNTIME_SOURCE_DIR="$SCRIPT_DIR/runtime"
RUNTIME_TARGET_DIR="$INSTALL_DIR/runtime"
LOGS_DIR="$INSTALL_DIR/logs"
CONFIG_TEMPLATE="$RUNTIME_TARGET_DIR/app/helper-config.template.json"
CONFIG_FILE="$RUNTIME_TARGET_DIR/app/helper-config.json"
NODE_BIN="$RUNTIME_TARGET_DIR/node/bin/node"
SERVER_FILE="$RUNTIME_TARGET_DIR/app/server.mjs"
STDOUT_LOG="$LOGS_DIR/stdout.log"
STDERR_LOG="$LOGS_DIR/stderr.log"
LAUNCHD_LABEL="com.miniapps.stem-helper"

if [[ ! -f "$PLIST_TEMPLATE" ]]; then
  echo "LaunchAgent template missing: $PLIST_TEMPLATE"
  exit 1
fi

if [[ ! -d "$RUNTIME_SOURCE_DIR" ]]; then
  echo "Runtime folder missing: $RUNTIME_SOURCE_DIR"
  exit 1
fi

if [[ -f "$SCRIPT_DIR/runtime/node/bin/node.placeholder.txt" ]]; then
  echo "Node runtime placeholder detected. Rebuild package with MINIAPPS_STEM_HELPER_NODE_SRC before installing."
  exit 1
fi

if [[ -f "$SCRIPT_DIR/runtime/python.placeholder.txt" ]]; then
  echo "Python runtime placeholder detected. Rebuild package with MINIAPPS_STEM_HELPER_PYTHON_SRC before installing."
  exit 1
fi

if [[ -f "$SCRIPT_DIR/runtime/ffmpeg.placeholder.txt" ]]; then
  echo "FFmpeg runtime placeholder detected. Rebuild package with MINIAPPS_STEM_HELPER_FFMPEG_SRC before installing."
  exit 1
fi

if [[ -f "$SCRIPT_DIR/runtime/ffmpeg/bin/ffprobe.placeholder.txt" ]]; then
  echo "FFprobe runtime placeholder detected. Rebuild package with MINIAPPS_STEM_HELPER_FFMPEG_SRC or MINIAPPS_STEM_HELPER_FFPROBE_SRC before installing."
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$LOGS_DIR" "$HOME/Library/LaunchAgents"
rm -rf "$RUNTIME_TARGET_DIR"
ditto "$RUNTIME_SOURCE_DIR" "$RUNTIME_TARGET_DIR"

chmod +x "$NODE_BIN" || true
chmod +x "$RUNTIME_TARGET_DIR/ffmpeg/bin/ffmpeg" || true
chmod +x "$RUNTIME_TARGET_DIR/ffmpeg/bin/ffprobe" || true
chmod -R u+x "$RUNTIME_TARGET_DIR/python/bin" >/dev/null 2>&1 || true

cp "$CONFIG_TEMPLATE" "$CONFIG_FILE"

sed \
  -e "s|__NODE_BIN__|$NODE_BIN|g" \
  -e "s|__SERVER_FILE__|$SERVER_FILE|g" \
  -e "s|__CONFIG_FILE__|$CONFIG_FILE|g" \
  -e "s|__STDOUT_LOG__|$STDOUT_LOG|g" \
  -e "s|__STDERR_LOG__|$STDERR_LOG|g" \
  "$PLIST_TEMPLATE" > "$PLIST_PATH"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl kickstart -k "gui/$(id -u)/$LAUNCHD_LABEL"

sleep 2

if curl -fsS "http://127.0.0.1:4195/api/health" >/dev/null; then
  echo "Stem Helper installed and healthy."
  exit 0
fi

echo "Stem Helper installed but health check failed."
echo "Check logs:"
echo "  $STDOUT_LOG"
echo "  $STDERR_LOG"
exit 1

#!/bin/zsh
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/miniapps/stem-helper"
PLIST_PATH="$HOME/Library/LaunchAgents/com.miniapps.stem-helper.plist"
LAUNCHD_LABEL="com.miniapps.stem-helper"

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl remove "$LAUNCHD_LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"
rm -rf "$INSTALL_DIR"

echo "Stem Helper removed."

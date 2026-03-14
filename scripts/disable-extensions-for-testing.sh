#!/usr/bin/env bash
#
# Temporarily disables Chrome/Brave extensions that interfere with browser automation.
#
# Password managers, ad blockers, and autofill extensions intercept form interactions
# and steal focus, causing "Cannot access chrome-extension:// URL" errors in
# browser automation tools like claude-in-chrome.
#
# Usage:
#   ./scripts/disable-extensions-for-testing.sh disable [chrome|brave]
#   ./scripts/disable-extensions-for-testing.sh restore [chrome|brave]

set -euo pipefail

ACTION="${1:-disable}"
BROWSER="${2:-chrome}"

# Resolve Extensions path based on OS and browser
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    APPDATA_LOCAL="$LOCALAPPDATA"
    case "$BROWSER" in
        chrome) EXT_DIR="$APPDATA_LOCAL/Google/Chrome/User Data/Default/Extensions" ;;
        brave)  EXT_DIR="$APPDATA_LOCAL/BraveSoftware/Brave-Browser/User Data/Default/Extensions" ;;
        *) echo "Unknown browser: $BROWSER (use chrome or brave)"; exit 1 ;;
    esac
elif [[ "$OSTYPE" == "darwin"* ]]; then
    case "$BROWSER" in
        chrome) EXT_DIR="$HOME/Library/Application Support/Google/Chrome/Default/Extensions" ;;
        brave)  EXT_DIR="$HOME/Library/Application Support/BraveSoftware/Brave-Browser/Default/Extensions" ;;
        *) echo "Unknown browser: $BROWSER"; exit 1 ;;
    esac
else
    case "$BROWSER" in
        chrome) EXT_DIR="$HOME/.config/google-chrome/Default/Extensions" ;;
        brave)  EXT_DIR="$HOME/.config/BraveSoftware/Brave-Browser/Default/Extensions" ;;
        *) echo "Unknown browser: $BROWSER"; exit 1 ;;
    esac
fi

BACKUP_DIR="${EXT_DIR}_disabled_for_testing"

case "$ACTION" in
    disable)
        if [[ -d "$BACKUP_DIR" ]]; then
            echo "Extensions already disabled for $BROWSER (backup exists)."
            exit 0
        fi
        if [[ ! -d "$EXT_DIR" ]]; then
            echo "Extensions directory not found: $EXT_DIR"
            exit 1
        fi
        echo "⚠️  Close $BROWSER before running this script."
        echo ""
        mv "$EXT_DIR" "$BACKUP_DIR"
        mkdir -p "$EXT_DIR"
        echo "✓ Extensions disabled for $BROWSER."
        echo "  Backup: $BACKUP_DIR"
        echo "  Run '$0 restore $BROWSER' when done testing."
        ;;

    restore)
        if [[ ! -d "$BACKUP_DIR" ]]; then
            echo "No backup found. Extensions were not disabled or already restored."
            exit 0
        fi
        echo "⚠️  Close $BROWSER before running this script."
        echo ""
        rm -rf "$EXT_DIR"
        mv "$BACKUP_DIR" "$EXT_DIR"
        echo "✓ Extensions restored for $BROWSER."
        ;;

    *)
        echo "Usage: $0 [disable|restore] [chrome|brave]"
        exit 1
        ;;
esac

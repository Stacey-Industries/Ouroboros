#!/usr/bin/env bash
# _token-lookup.sh — Shared token-file path resolution for Ouroboros hook scripts.
# Source this file: . "$(dirname "$0")/_token-lookup.sh"
#
# Lookup order (first match wins):
#   1. OUROBOROS_TOKEN_FILE env var  (explicit override / test injection)
#   2. Well-known platform path      (matches Electron app.getPath('userData'))
#   3. Caller falls back to OUROBOROS_HOOKS_TOKEN / OUROBOROS_TOOL_TOKEN env vars

# Returns the resolved token file path to stdout.
get_ouroboros_token_file() {
    if [ -n "${OUROBOROS_TOKEN_FILE:-}" ]; then
        echo "$OUROBOROS_TOKEN_FILE"
        return
    fi
    case "$(uname -s)" in
        Darwin)
            echo "$HOME/Library/Application Support/Ouroboros/session-tokens.json"
            ;;
        *)
            # Linux, WSL, and other POSIX systems
            echo "${XDG_CONFIG_HOME:-$HOME/.config}/Ouroboros/session-tokens.json"
            ;;
    esac
}

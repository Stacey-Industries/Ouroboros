#!/bin/bash
# run-spike.sh — Install test deps and run the embedding spike
#
# Usage: bash spike/run-spike.sh
#
# This script installs @xenova/transformers temporarily (--no-save so it
# does not appear in package.json) then runs the spike via tsx.
#
# The model download (~80MB) happens on the first run and is cached at
# ~/.cache/huggingface/hub/ (Linux/Mac) or %USERPROFILE%\.cache\huggingface\hub\ (Windows).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Project root: $PROJECT_ROOT"
cd "$PROJECT_ROOT"

# Install @xenova/transformers if not already present
if ! node -e "require('@xenova/transformers')" 2>/dev/null; then
  echo "==> Installing @xenova/transformers (--no-save)..."
  npm install --no-save @xenova/transformers
  echo "==> Installed."
else
  echo "==> @xenova/transformers already available."
fi

echo "==> Running embedding spike..."
echo ""
npx tsx spike/embedding-spike.ts

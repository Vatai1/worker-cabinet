#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="/Users/vatai/mini-agent"
VENV="$AGENT_DIR/.venv/bin/python"
AGENT_SRC="$(cd "$SCRIPT_DIR/../docker/mini-agent" && pwd)/agent.py"
WATCH_DIR="$(cd "$SCRIPT_DIR/../docker/mini-agent" && pwd)"

if [ ! -f "$VENV" ]; then
  echo "venv не найден: $AGENT_DIR/.venv"
  exit 1
fi

if "$VENV" -c "import watchfiles" 2>/dev/null; then
  echo "Watching $WATCH_DIR for changes..."
  "$VENV" -m watchfiles --filter "*.py" "$VENV" "$AGENT_SRC" "$WATCH_DIR"
else
  exec "$VENV" "$AGENT_SRC"
fi

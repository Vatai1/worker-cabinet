#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="/Users/vatai/mini-agent"
VENV="$AGENT_DIR/.venv/bin/python"
WATCH_DIR="$(cd "$SCRIPT_DIR/../docker/mini-agent" && pwd)"

if [ ! -f "$VENV" ]; then
  echo "venv не найден: $AGENT_DIR/.venv"
  exit 1
fi

if "$VENV" -c "import watchfiles" 2>/dev/null; then
  "$VENV" "$WATCH_DIR/_watch.py"
else
  "$VENV" "$WATCH_DIR/agent.py"
fi

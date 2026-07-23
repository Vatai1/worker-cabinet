#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="/Users/vatai/mini-agent"
VENV="$AGENT_DIR/.venv/bin/python"
AGENT_SRC="$(cd "$SCRIPT_DIR/../docker/mini-agent" && pwd)/agent.py"

if [ ! -f "$VENV" ]; then
  echo "venv не найден: $AGENT_DIR/.venv"
  exit 1
fi

exec "$VENV" "$AGENT_SRC"

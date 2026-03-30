#!/bin/bash
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SKIP_PYTHON=false
SKIP_GO=false

for arg in "$@"; do
  case "$arg" in
    --skip-python) SKIP_PYTHON=true ;;
    --skip-go)     SKIP_GO=true ;;
  esac
done

# Prerequisite checks
if [ "$SKIP_PYTHON" = false ]; then
  if ! command -v uv &> /dev/null; then
    echo "ERROR: uv is not installed. Install it from https://docs.astral.sh/uv/ or pass --skip-python."
    exit 1
  fi
fi

if [ "$SKIP_GO" = false ]; then
  if ! command -v go &> /dev/null; then
    echo "ERROR: go is not installed. Install it from https://go.dev/dl/ or pass --skip-go."
    exit 1
  fi
fi

echo "Building all test servers..."
echo ""

# ── TypeScript servers ──────────────────────────────────────────────────────
TS_SERVERS=(
  clean-mcp
  bad-names-mcp
  mixed-conventions-mcp
  kitchen-sink-mcp
  market-mcp
)

echo "TypeScript servers:"
for server in "${TS_SERVERS[@]}"; do
  echo "  Building $server..."
  cd "$ROOT/$server"
  npm install --silent
  npm run build --silent
done

# ── Python servers ──────────────────────────────────────────────────────────
PYTHON_SERVERS=(
  param-conflicts-mcp
  shadow-mcp
  too-many-tools-mcp
)

echo ""
if [ "$SKIP_PYTHON" = true ]; then
  echo "Python servers: skipped (--skip-python)"
else
  echo "Python servers:"
  for server in "${PYTHON_SERVERS[@]}"; do
    echo "  Syncing $server..."
    cd "$ROOT/$server"
    uv sync --quiet
  done
fi

# ── Go servers ──────────────────────────────────────────────────────────────
echo ""
if [ "$SKIP_GO" = true ]; then
  echo "Go servers: skipped (--skip-go)"
else
  echo "Go servers:"
  echo "  Building finance-mcp..."
  cd "$ROOT/finance-mcp"
  go build -o finance-mcp .
fi

echo ""
echo "All test servers built successfully."

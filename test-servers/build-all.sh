#!/bin/bash
set -e

SERVERS=(
  clean-mcp
  bad-names-mcp
  mixed-conventions-mcp
  param-conflicts-mcp
  shadow-mcp
  too-many-tools-mcp
  kitchen-sink-mcp
  finance-mcp
  market-mcp
)

echo "Building all test servers..."
for server in "${SERVERS[@]}"; do
  echo "  Building $server..."
  cd "$server"
  npm install --silent
  npm run build --silent
  cd ..
done
echo "All test servers built successfully."

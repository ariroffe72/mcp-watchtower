#!/bin/bash
PASS=0
FAIL=0
SKIP=0
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="node $ROOT/dist/cli/index.js"

SKIP_PYTHON=false
SKIP_GO=false

for arg in "$@"; do
  case "$arg" in
    --skip-python) SKIP_PYTHON=true ;;
    --skip-go)     SKIP_GO=true ;;
  esac
done

check() {
  local label=$1
  local expected_exit=$2
  shift 2
  local cmd="$@"
  eval "$cmd" > /dev/null 2>&1
  actual_exit=$?
  if [ "$actual_exit" -eq "$expected_exit" ]; then
    echo "  ✔ $label"
    ((PASS++))
  else
    echo "  ✖ $label (expected exit $expected_exit, got $actual_exit)"
    ((FAIL++))
  fi
}

skip() {
  local label=$1
  echo "  ⊘ $label (skipped)"
  ((SKIP++))
}

echo ""
echo "mcp-lens end-to-end test suite"
echo "─────────────────────────────────────"
echo ""

# ── TypeScript servers ──────────────────────────────────────────────────────
echo "TypeScript server tests:"
check "clean-mcp — zero findings"              0 "$CLI scan --server 'node $SERVERS_DIR/clean-mcp/dist/index.js'"
check "bad-names-mcp — critical duplicate"     1 "$CLI scan --server 'node $SERVERS_DIR/bad-names-mcp/dist/index.js'"
check "mixed-conventions-mcp — warnings only"  0 "$CLI scan --server 'node $SERVERS_DIR/mixed-conventions-mcp/dist/index.js'"
check "kitchen-sink-mcp — critical"            1 "$CLI scan --server 'node $SERVERS_DIR/kitchen-sink-mcp/dist/index.js'"
check "market-mcp — zero findings"             0 "$CLI scan --server 'node $SERVERS_DIR/market-mcp/dist/index.js'"

# ── Python servers ──────────────────────────────────────────────────────────
echo ""
echo "Python server tests:"
if [ "$SKIP_PYTHON" = true ]; then
  skip "param-conflicts-mcp — warnings only"
  skip "shadow-mcp — warnings only"
  skip "too-many-tools-mcp — warning only"
else
  check "param-conflicts-mcp — warnings only"  0 "$CLI scan --server 'uv --directory $SERVERS_DIR/param-conflicts-mcp run server.py'"
  check "shadow-mcp — warnings only"           0 "$CLI scan --server 'uv --directory $SERVERS_DIR/shadow-mcp run server.py'"
  check "too-many-tools-mcp — warning only"    0 "$CLI scan --server 'uv --directory $SERVERS_DIR/too-many-tools-mcp run server.py'"
fi

# ── Go servers ──────────────────────────────────────────────────────────────
echo ""
echo "Go server tests:"
if [ "$SKIP_GO" = true ]; then
  skip "finance-mcp — zero findings"
  skip "finance-mcp with --platform (clean server)"
else
  check "finance-mcp — zero findings"              0 "$CLI scan --server '$SERVERS_DIR/finance-mcp/finance-mcp'"
  check "finance-mcp with --platform (clean server)" 0 "$CLI scan --server '$SERVERS_DIR/finance-mcp/finance-mcp' --platform"
fi

# ── Platform mode tests ──────────────────────────────────────────────────────
echo ""
echo "Platform mode tests:"
# Note: --platform stores config for future cross-server collision detection.
# Single-server scans: clean servers stay exit 0, servers with internal criticals stay exit 1.
check "market-mcp without --platform"       0 "$CLI scan --server 'node $SERVERS_DIR/market-mcp/dist/index.js'"
check "market-mcp with --platform"          0 "$CLI scan --server 'node $SERVERS_DIR/market-mcp/dist/index.js' --platform"
check "bad-names-mcp with --platform"       1 "$CLI scan --server 'node $SERVERS_DIR/bad-names-mcp/dist/index.js' --platform"
check "kitchen-sink-mcp with --platform"    1 "$CLI scan --server 'node $SERVERS_DIR/kitchen-sink-mcp/dist/index.js' --platform"

# ── Output format / misc tests ──────────────────────────────────────────────
echo ""
echo "Output format tests:"
check "JSON output is valid"                   0 "$CLI scan --server 'node $SERVERS_DIR/clean-mcp/dist/index.js' --json | node -e 'process.stdin.resume();let d=\"\";process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>JSON.parse(d))'"
check "manifest fallback works"                0 "$CLI scan --manifest $ROOT/tests/fixtures/sample-tools.json"
check "no args shows error not crash"          1 "$CLI scan"
check "bad server command fails gracefully"    1 "$CLI scan --server 'nonexistent-command-xyz-abc'"

echo ""
echo "─────────────────────────────────────"
if [ "$SKIP" -gt 0 ]; then
  echo "$PASS passed, $FAIL failed, $SKIP skipped"
else
  echo "$PASS passed, $FAIL failed"
fi
echo ""
[ "$FAIL" -eq 0 ] || exit 1

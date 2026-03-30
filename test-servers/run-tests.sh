#!/bin/bash
PASS=0
FAIL=0
ROOT="$(cd .. && pwd)"
CLI="node $ROOT/dist/cli/index.js"

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

echo ""
echo "mcp-lens end-to-end test suite"
echo "─────────────────────────────────────"
echo ""

echo "Single server tests:"
check "clean-mcp — zero findings"              0 "$CLI scan --server 'node clean-mcp/dist/index.js'"
check "bad-names-mcp — critical duplicate"     1 "$CLI scan --server 'node bad-names-mcp/dist/index.js'"
check "mixed-conventions-mcp — warnings only"  0 "$CLI scan --server 'node mixed-conventions-mcp/dist/index.js'"
check "param-conflicts-mcp — warnings only"    0 "$CLI scan --server 'node param-conflicts-mcp/dist/index.js'"
check "shadow-mcp — warnings only"             0 "$CLI scan --server 'node shadow-mcp/dist/index.js'"
check "too-many-tools-mcp — warning only"      0 "$CLI scan --server 'node too-many-tools-mcp/dist/index.js'"
check "kitchen-sink-mcp — critical"            1 "$CLI scan --server 'node kitchen-sink-mcp/dist/index.js'"

echo ""
echo "Platform mode tests:"
# Note: --platform elevates name-collision severity and is intended for multi-server
# registry use. Cross-server detection is a future feature. These tests confirm that
# clean single-server scans remain exit 0 and that servers with internal criticals
# remain exit 1 regardless of the --platform flag.
check "finance-mcp without --platform"              0 "$CLI scan --server 'node finance-mcp/dist/index.js'"
check "finance-mcp with --platform (clean server)"  0 "$CLI scan --server 'node finance-mcp/dist/index.js' --platform"
check "market-mcp without --platform"               0 "$CLI scan --server 'node market-mcp/dist/index.js'"
check "market-mcp with --platform (clean server)"   0 "$CLI scan --server 'node market-mcp/dist/index.js' --platform"
check "bad-names-mcp with --platform"               1 "$CLI scan --server 'node bad-names-mcp/dist/index.js' --platform"
check "kitchen-sink-mcp with --platform"            1 "$CLI scan --server 'node kitchen-sink-mcp/dist/index.js' --platform"

echo ""
echo "Output format tests:"
check "JSON output is valid"                   0 "$CLI scan --server 'node clean-mcp/dist/index.js' --json | node -e 'process.stdin.resume();let d=\"\";process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>JSON.parse(d))'"
check "manifest fallback works"                0 "$CLI scan --manifest $ROOT/tests/fixtures/sample-tools.json"
check "no args shows error not crash"          1 "$CLI scan"
check "bad server command fails gracefully"    1 "$CLI scan --server 'nonexistent-command-xyz-abc'"

echo ""
echo "─────────────────────────────────────"
echo "$PASS passed, $FAIL failed"
echo ""
[ "$FAIL" -eq 0 ] || exit 1

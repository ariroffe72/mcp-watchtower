# mcp-lens test servers

Nine deliberately crafted MCP servers used to test mcp-lens end to end.
Each server triggers specific findings (or no findings) when scanned.

| Server | Language | Expected findings | Exit code |
|---|---|---|---|
| clean-mcp | TypeScript | none | 0 |
| bad-names-mcp | TypeScript | DUPLICATE_TOOL_NAME (critical) | 1 |
| mixed-conventions-mcp | TypeScript | NAMING_CONVENTION (warning) | 0 |
| param-conflicts-mcp | Python / FastMCP | PARAMETER_CONFLICT (warning) | 0 |
| shadow-mcp | Python / raw SDK | SHADOW_PATTERN (warning) | 0 |
| too-many-tools-mcp | Python / raw SDK | TOOL_COUNT_WARNING (warning) | 0 |
| kitchen-sink-mcp | TypeScript | all five finding types | 1 |
| finance-mcp | Go | none | 0 |
| market-mcp | TypeScript | none | 0 |

## Prerequisites

- **Node >= 18** — for TypeScript servers and the mcp-lens CLI
- **uv** — for Python servers (<https://docs.astral.sh/uv/>)
- **Go >= 1.21** — for finance-mcp (<https://go.dev/dl/>)

## Build all servers

Works on Mac, Windows, and Linux:

```bash
# Build everything
node build-all.js

# Skip languages you don't have installed
node build-all.js --skip-python
node build-all.js --skip-go
node build-all.js --skip-python --skip-go
```

Or use npm scripts from inside `test-servers/`:

```bash
npm run build          # build everything
npm run build:ts       # TypeScript only
npm run build:skip-go  # skip Go
```

## Run the test suite

First build the main mcp-lens package (`npm run build` in the repo root), then:

```bash
# Run everything
node run-tests.js

# Skip languages not installed
node run-tests.js --skip-python
node run-tests.js --skip-go
node run-tests.js --skip-python --skip-go
```

Or use npm scripts:

```bash
npm test           # run all tests
npm run test:ts    # TypeScript + output format tests only
npm run test:skip-go  # skip Go server tests
```

## Manual scanning

Any server can be scanned directly with the mcp-lens CLI:

```bash
# TypeScript server
mcp-lens scan --server "node clean-mcp/dist/index.js"

# Python server (--directory tells uv which project virtualenv to use)
mcp-lens scan --server "uv --directory param-conflicts-mcp run server.py"

# Go server (pre-compiled binary)
mcp-lens scan --server "./finance-mcp/finance-mcp"
```

## Adding a new test server

1. Create a subdirectory under `test-servers/`.
2. Implement a minimal MCP server that responds to `tools/list`.
3. Add it to the appropriate section in `build-all.js`.
4. Add a `check()` line in `run-tests.js` with the expected exit code.
5. Update the table in this README.

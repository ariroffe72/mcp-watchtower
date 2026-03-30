# mcp-lens test servers

End-to-end test fixtures for `mcp-lens`. Each server is a minimal MCP implementation designed to exercise a specific set of findings. Together they prove that `mcp-lens` works across multiple languages and MCP SDK implementations.

## Servers

| Server | Language / SDK | Expected findings | Exit code |
|--------|---------------|-------------------|-----------|
| `clean-mcp` | TypeScript / `@modelcontextprotocol/sdk` | none | 0 |
| `bad-names-mcp` | TypeScript / low-level `Server` API | DUPLICATE_TOOL_NAME (critical) | 1 |
| `mixed-conventions-mcp` | TypeScript / `McpServer` | NAMING_CONVENTION (warning) | 0 |
| `param-conflicts-mcp` | Python / FastMCP | PARAMETER_CONFLICT (warning) | 0 |
| `shadow-mcp` | Python / raw `mcp` SDK | SHADOW_PATTERN (warning) | 0 |
| `too-many-tools-mcp` | Python / raw `mcp` SDK | TOOL_COUNT_WARNING (warning) | 0 |
| `kitchen-sink-mcp` | TypeScript / low-level `Server` API | all five finding types (critical) | 1 |
| `finance-mcp` | Go / `mcp-go` | none | 0 |
| `market-mcp` | TypeScript / `McpServer` | none | 0 |

## Prerequisites

| Prerequisite | Required for | Install |
|---|---|---|
| Node.js ≥ 18 + npm | TypeScript servers | https://nodejs.org |
| [uv](https://docs.astral.sh/uv/) | Python servers | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| Go ≥ 1.21 | Go servers | https://go.dev/dl/ |

## Building

```bash
# Build everything
bash build-all.sh

# Skip Python servers (no uv required)
bash build-all.sh --skip-python

# Skip Go servers (no Go required)
bash build-all.sh --skip-go

# Skip both
bash build-all.sh --skip-python --skip-go
```

On Windows use `build-all.bat` with the same flags.

## Running the test suite

Run from the `test-servers/` directory after building the main `mcp-lens` package (`npm run build` in the repo root) and building the test servers.

```bash
bash run-tests.sh

# Skip language-specific tests if prerequisites are absent
bash run-tests.sh --skip-python
bash run-tests.sh --skip-go
bash run-tests.sh --skip-python --skip-go
```

## Manual testing

Any server can be scanned individually with the `mcp-lens` CLI:

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
3. Add it to the appropriate section in `build-all.sh` (and `build-all.bat`).
4. Add a `check` line in `run-tests.sh` with the expected exit code.
5. Update the table in this README.

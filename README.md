# mcp-lens

Static analysis and compatibility checks for MCP (Model Context Protocol) servers.
Point it at any MCP server — TypeScript, Python, Go, anything — and get a full
report on tool naming conflicts, parameter inconsistencies, shadow patterns, and
more.

## Usage

```bash
# Any MCP server — just provide the start command
npx mcp-lens scan --server "python my_server.py"
npx mcp-lens scan --server "node dist/server.js"
npx mcp-lens scan --server "uvx my-published-server"

# CI mode — pass a tools manifest instead
npx mcp-lens scan --manifest ./tools.json

# JSON output for programmatic use
npx mcp-lens scan --server "python my_server.py" --json
```

## What it checks

- Duplicate tool names within your server
- Inconsistent naming conventions (snake_case vs camelCase vs kebab-case)
- Parameter name conflicts across tools (ticker vs symbol for the same concept)
- Shadow patterns in descriptions that hijack LLM tool routing
- Tool count warnings (routing accuracy degrades above ~20 tools)

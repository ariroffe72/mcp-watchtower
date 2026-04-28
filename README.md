# mcp-watchtower

Static analysis for MCP (Model Context Protocol) servers. Point it at any MCP
server — TypeScript, Python, Go, anything — and get a full compatibility report
in seconds.

## What it checks

- **Duplicate tool names** — two tools in the same server with the same name
- **Naming convention inconsistency** — mixing snake_case, camelCase, and kebab-case
- **Parameter conflicts** — ticker in one tool, symbol in another for the same concept
- **Shadow patterns** — description language that hijacks LLM tool routing
- **Tool count** — routing accuracy degrades above ~20 tools per server

## Usage

```bash
# Local MCP server over stdio
npx mcp-watchtower scan --server "python my_server.py"
npx mcp-watchtower scan --server "node dist/server.js"
npx mcp-watchtower scan --server "uvx my-published-server"

# Remote MCP server over HTTP with bearer auth
npx mcp-watchtower scan --remote "https://api.example.com/mcp" --auth-token "$MCP_TOKEN"

# CI mode — pass a tools manifest instead of spinning up a server
npx mcp-watchtower scan --manifest ./tools.json

# Flags
npx mcp-watchtower scan --server "python my_server.py" --json          # JSON output
npx mcp-watchtower scan --server "python my_server.py" --platform      # platform mode
npx mcp-watchtower scan --server "python my_server.py" --max-tools 15  # custom threshold
npx mcp-watchtower scan --server "python my_server.py" --name my-api   # custom server name
npx mcp-watchtower scan --remote "https://api.example.com/mcp" --auth-token "$MCP_TOKEN" --name prod-api
```

## Exit codes

- `0` — no critical findings
- `1` — one or more critical findings (safe to use as a CI gate)

## Using as a library

```typescript
import { StaticAnalyzer } from 'mcp-watchtower'

const analyzer = new StaticAnalyzer({ platform: false, maxTools: 20 })
const report = analyzer.analyze('my-server', tools)
console.log(report.findings)
```

## CI example (GitHub Actions)

```yaml
- name: Lint MCP tools
  run: npx mcp-watchtower scan --server "node dist/server.js" --json
```

## Platform mode

If you are building an agent orchestrator or MCP registry that loads multiple
servers simultaneously, pass `--platform`. This elevates name collision findings
from informational to critical, since collisions are genuinely dangerous when
multiple servers are loaded in the same context.

```bash
npx mcp-watchtower scan --server "node dist/server.js" --platform
```

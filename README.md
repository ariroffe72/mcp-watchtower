# mcp-watchtower

Analyze MCP servers for naming, routing, and semantic tool conflicts.

`mcp-watchtower` can inspect a live MCP server, a remote MCP endpoint, or a JSON tool manifest and produce:

- **static findings** for duplicate names, naming inconsistencies, parameter conflicts, shadow patterns, and oversized tool surfaces
- **semantic findings** for tools that already exist in the broader MCP corpus or are likely to overlap with existing tools

![Index refresh](https://github.com/ariroffe72/mcp-watchtower/actions/workflows/refresh-index.yml/badge.svg)
![Index updated](https://img.shields.io/badge/dynamic/json?url=https://pub-0eeb51ca45a14ebe89372cca3f4bea7f.r2.dev/manifest.json&query=$.version&label=index%20updated&color=blue)

## Quick start

```bash
npx mcp-watchtower scan --server "uvx my-server"
```

## CLI

```bash
# Local MCP server over stdio
npx mcp-watchtower scan --server "uvx my-server"

# Remote MCP endpoint
npx mcp-watchtower scan --remote "https://api.example.com/mcp" --auth-token "$MCP_TOKEN"

# Manifest / CI input
npx mcp-watchtower scan --manifest ./tools.json --name my-server
```

### Useful flags

```bash
# JSON output
npx mcp-watchtower scan --server "uvx my-server" --json

# Treat static name collisions as critical
npx mcp-watchtower scan --server "uvx my-server" --platform

# Semantic overlap detection against the corpus index
npx mcp-watchtower scan --server "uvx my-server" --semantic

# Tune semantic sensitivity
npx mcp-watchtower scan --server "uvx my-server" --semantic --threshold 0.8
```

## What it checks

### Static analysis

- duplicate tool names
- inconsistent naming conventions
- conflicting parameter names for the same concept
- prompt-shadowing language in tool descriptions
- excessive tool counts

### Semantic analysis

- `ALREADY_IN_CORPUS` — the tool appears to already exist in the corpus
- `SEMANTIC_OVERLAP` — the tool looks close to an existing tool and may need clearer disambiguation

## Index behavior

Semantic analysis ships with a bundled fallback index in `src/data/`.

On CLI startup, `mcp-watchtower` also checks the published CDN manifest and, if a newer index is available, downloads it to:

```text
~/.mcp-watchtower/index/
```

If the CDN is unavailable or the update fails, scans continue silently with the bundled index.

## Exit codes

- `0` — no critical static findings
- `1` — one or more critical static findings

Semantic findings are informational or warning-level only and do **not** affect the exit code.

## Library usage

```ts
import { SemanticAnalyzer, StaticAnalyzer } from 'mcp-watchtower'

const staticReport = new StaticAnalyzer().analyze('my-server', tools)
const semanticReport = await new SemanticAnalyzer().analyze('my-server', tools)
```

## Developer workflow

```bash
npm run build
npm test
npm run crawl
npm run embed
npm run build-index
npm run publish-index
```

If you're working from a local clone instead of npm, build first and run the compiled CLI directly:

```bash
npm install
npm run build
node dist/cli/index.js scan --server "uvx my-server"
```

`publish-index` rebuilds the corpus, embeddings, and semantic index, then uploads the refreshed assets and manifest to Cloudflare R2. The nightly GitHub Actions workflow at `.github/workflows/refresh-index.yml` runs the same publish step automatically.


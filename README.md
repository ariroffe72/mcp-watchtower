# MCP Watchtower

> Analyze MCP servers for naming, routing, and semantic tool conflicts before they confuse agents or collide with the wider MCP ecosystem.

[![Index refresh](https://github.com/ariroffe72/mcp-watchtower/actions/workflows/refresh-index.yml/badge.svg)](https://github.com/ariroffe72/mcp-watchtower/actions/workflows/refresh-index.yml)
![Index updated](https://img.shields.io/badge/dynamic/json?url=https://pub-0eeb51ca45a14ebe89372cca3f4bea7f.r2.dev/manifest.json&query=$.version&label=index%20updated&color=blue)

**Documentation:** [Get started](https://self-5d39fc87.mintlify.app/introduction) · [CLI reference](https://self-5d39fc87.mintlify.app/cli/scan) · [Checks](https://self-5d39fc87.mintlify.app/checks/overview) · [API](https://self-5d39fc87.mintlify.app/api/overview)

```bash
npx mcp-watchtower scan --server "uvx my-server"
```

## Why it exists

MCP servers are easy to publish, but hard to compare. Two servers can expose tools that sound different to humans but look interchangeable to an agent, or they can define parameters that mean the same thing under different names.

MCP Watchtower scans a local server, remote endpoint, or manifest and reports:

- **Static issues** such as duplicate tool names, inconsistent naming, prompt-shadowing descriptions, and oversized tool sets.
- **Semantic overlap** against a continuously refreshed MCP corpus so you can spot tools that already exist or need clearer boundaries.
- **Parameter conflicts** where equivalent concepts are named inconsistently inside the same server.

## How it works

![MCP Watchtower workflow](https://raw.githubusercontent.com/ariroffe72/mcp-watchtower/main/docs/assets/diagrams/mcp-watchtower-workflow.png)

MCP Watchtower combines deterministic static checks with semantic comparison against a published index. Scans keep working offline by falling back to the bundled index in `src/data/`.

## Quick examples

```bash
# Local MCP server over stdio
npx mcp-watchtower scan --server "uvx my-server"

# Remote MCP endpoint
npx mcp-watchtower scan --remote "https://api.example.com/mcp"

# Remote MCP endpoint with bearer auth
npx mcp-watchtower scan --remote "https://api.example.com/mcp" --auth-token "$MCP_TOKEN"

# Manifest / CI input
npx mcp-watchtower scan --manifest ./tools.json --name my-server

# Machine-readable output
npx mcp-watchtower scan --server "uvx my-server" --json
```

Plain `scan` runs both static and semantic analysis. Common focused scans:

```bash
# Static checks only
npx mcp-watchtower scan --server "uvx my-server" --syntactic

# Semantic checks only
npx mcp-watchtower scan --server "uvx my-server" --semantic

# Expanded human-readable logging
npx mcp-watchtower scan --server "uvx my-server" --verbose

# Tune semantic sensitivity
npx mcp-watchtower scan --server "uvx my-server" --threshold 0.8
```

Use `--platform` to treat static name collisions as critical.

## Findings at a glance

| Layer | Examples | Affects exit code? |
| --- | --- | --- |
| Static | Duplicate names, naming convention drift, suspicious descriptions, excessive tool counts | Yes, for critical findings |
| Semantic | `ALREADY_IN_CORPUS`, `SEMANTIC_OVERLAP`, `SEMANTIC_PARAMETER_CONFLICT` | No, warning/informational only |

Exit code `0` means no critical static findings were found and the scan completed successfully. Exit code `1` means either at least one critical static finding was found or the CLI encountered a runtime/usage error (for example, invalid input or a connection failure).

## Programmatic usage

```ts
import { SemanticAnalyzer, StaticAnalyzer } from 'mcp-watchtower'

const staticReport = new StaticAnalyzer().analyze('my-server', tools)
const semanticReport = await new SemanticAnalyzer().analyze('my-server', tools)
```

## Documentation

The full docs include setup guidance, deeper explanations, and API references:

- [Introduction](https://self-5d39fc87.mintlify.app/introduction)
- [CLI scan command](https://self-5d39fc87.mintlify.app/cli/scan)
- [Checks overview](https://self-5d39fc87.mintlify.app/checks/overview)
- [Static analysis guide](https://self-5d39fc87.mintlify.app/guides/static-analysis)
- [Semantic analysis guide](https://self-5d39fc87.mintlify.app/guides/semantic-analysis)
- [API overview](https://self-5d39fc87.mintlify.app/api/overview)

## Development

```bash
npm install
npm run build
npm test
npm run pack:check
```

Run the compiled CLI from a local clone:

```bash
node dist/cli/index.js scan --server "uvx my-server"
```

Useful maintenance commands:

```bash
npm run crawl
npm run embed
npm run build-index
npm run publish-index
```

`publish-index` rebuilds the corpus, embeddings, and semantic index, then uploads the refreshed assets and manifest to Cloudflare R2. The nightly GitHub Actions workflow in `.github/workflows/refresh-index.yml` runs the same publish step automatically.

## Release notes for maintainers

Package releases use Changesets and are separate from semantic index refreshes.

- Add a normal changeset for user-visible package changes.
- Use `npx changeset --empty` for intentional no-release work.
- Validate release artifacts with `npm run build`, `npm test`, and `npm run pack:check`.
- The `release.yml` workflow publishes pending changesets to npm after merge to `main`.

## License

MIT

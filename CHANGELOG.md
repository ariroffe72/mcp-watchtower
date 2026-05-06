# mcp-watchtower

## 0.2.2

### Patch Changes

- 18ef75b: Fix the published package contents so the CLI includes semantic embedding runtime files, and fail packaging checks when required runtime assets are missing from the npm tarball.
- 8693a06: Stream live per-tool scan progress and findings in the default human-readable CLI output, keep `--json` output machine-readable, and reserve `--verbose` for future expanded logging.

export interface ScanInputOptions {
  server?: string
  remote?: string
  authToken?: string
  manifest?: string
}

export type InputMode = 'server' | 'remote' | 'manifest' | 'stdin'

export function resolveInputMode(options: ScanInputOptions, stdinIsTTY: boolean): InputMode {
  const explicitModes = [
    options.server ? 'server' : null,
    options.remote ? 'remote' : null,
    options.manifest ? 'manifest' : null,
  ].filter((mode): mode is Exclude<InputMode, 'stdin'> => mode !== null)

  if (explicitModes.length > 1) {
    throw new Error('Provide only one input source: --server, --remote, or --manifest.')
  }

  if (options.remote) {
    if (!options.authToken) {
      throw new Error('Missing auth token. Use --auth-token when connecting with --remote.')
    }
    return 'remote'
  }

  if (options.server) return 'server'
  if (options.manifest) return 'manifest'
  if (!stdinIsTTY) return 'stdin'

  throw new Error(
    'No input provided. Examples:\n\n' +
    '  npx mcp-watchtower scan --server "python my_server.py"\n' +
    '  npx mcp-watchtower scan --remote "https://api.example.com/mcp" --auth-token "$TOKEN"\n' +
    '  npx mcp-watchtower scan --manifest ./tools.json\n'
  )
}

export function deriveServerNameFromCommand(command: string): string {
  const parts = command.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  return last.replace(/\.[^.]+$/, '').split(/[\\/]/).pop() ?? 'unknown-server'
}

export function deriveServerNameFromUrl(endpoint: string): string {
  const url = new URL(endpoint)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const lastPathPart = pathParts[pathParts.length - 1]

  if (lastPathPart && lastPathPart.toLowerCase() !== 'mcp') {
    return `${url.hostname}-${lastPathPart}`
  }

  return url.hostname || 'remote-server'
}

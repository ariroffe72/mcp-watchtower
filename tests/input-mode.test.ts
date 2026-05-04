import { describe, it, expect } from 'vitest'
import {
  deriveServerNameFromCommand,
  deriveServerNameFromUrl,
  resolveInputMode,
} from '../cli/input.js'

describe('CLI input mode selection', () => {
  it('selects local server mode when --server is provided', () => {
    const mode = resolveInputMode({ server: 'python my_server.py' }, true)
    expect(mode).toBe('server')
  })

  it('selects remote mode when --remote and --auth-token are provided', () => {
    const mode = resolveInputMode(
      { remote: 'https://api.example.com/mcp', authToken: 'token-123' },
      true
    )
    expect(mode).toBe('remote')
  })

  it('selects remote mode when --remote is provided without an auth token', () => {
    const mode = resolveInputMode({ remote: 'https://api.example.com/mcp' }, true)
    expect(mode).toBe('remote')
  })

  it('rejects multiple explicit input modes at the same time', () => {
    expect(() => resolveInputMode(
      {
        server: 'python my_server.py',
        remote: 'https://api.example.com/mcp',
        authToken: 'token-123',
      },
      true
    )).toThrow('Provide only one input source')
  })

  it('falls back to stdin when no explicit mode is provided and stdin is piped', () => {
    const mode = resolveInputMode({}, false)
    expect(mode).toBe('stdin')
  })
})

describe('server name derivation', () => {
  it('derives command-based names for Unix paths and Windows paths', () => {
    expect(deriveServerNameFromCommand('node dist/server.js')).toBe('server')
    expect(deriveServerNameFromCommand('python C:\\mcp\\finance_server.py')).toBe('finance_server')
  })

  it('derives URL-based names for /mcp endpoints and custom paths', () => {
    expect(deriveServerNameFromUrl('https://api.example.com/mcp')).toBe('api.example.com')
    expect(deriveServerNameFromUrl('https://api.example.com/tools')).toBe('api.example.com-tools')
  })
})

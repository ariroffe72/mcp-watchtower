import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

describe('package rename metadata', () => {
  it('uses mcp-watchtower as package and bin name', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
      name: string
      bin: Record<string, string>
    }

    expect(pkg.name).toBe('mcp-watchtower')
    expect(pkg.bin).toHaveProperty('mcp-watchtower', './dist/cli/index.js')
  })

  it('uses mcp-watchtower in CLI program and client names', () => {
    const cli = readFileSync(join(ROOT, 'cli', 'index.ts'), 'utf-8')

    expect(cli).toContain(".name('mcp-watchtower')")
    expect(cli).toContain("{ name: 'mcp-watchtower', version: '0.1.0' }")
  })
})

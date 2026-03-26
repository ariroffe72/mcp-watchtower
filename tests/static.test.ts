import { describe, it, expect } from 'vitest'

describe('StaticAnalyzer scaffold', () => {
  it('types are importable', async () => {
    const mod = await import('../src/types')
    expect(mod).toBeDefined()
  })
})

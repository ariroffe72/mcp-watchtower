import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolSchema } from '../src/types.js'

const metadata = [
  {
    server: 'corpus-server',
    displayName: 'Corpus Server',
    toolName: 'lookup_quote',
    description: 'Look up stock quotes by ticker.',
  },
]

class FakeHierarchicalNSW {
  readIndexSync() {}
  setEf() {}
  getCurrentCount() {
    return metadata.length
  }
  searchKnn() {
    return {
      neighbors: [0],
      distances: [0.1],
    }
  }
}

vi.mock('../src/embeddings/provider.js', () => ({
  EMBEDDING_DIMENSIONS: 2,
  embed: vi.fn(async () => Float32Array.from([1, 0])),
}))

vi.mock('node:module', async () => {
  const actual = await vi.importActual<typeof import('node:module')>('node:module')

  return {
    ...actual,
    createRequire: () => (id: string) => {
      if (id === 'hnswlib-node') {
        return { HierarchicalNSW: FakeHierarchicalNSW }
      }

      return actual.createRequire(import.meta.url)(id)
    },
  }
})

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')

  return {
    ...actual,
    readFileSync: vi.fn(() => JSON.stringify(metadata)),
    existsSync: vi.fn((path: import('node:fs').PathLike) => String(path).endsWith('package.json')),
  }
})

describe('SemanticAnalyzer', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('reports each tool start once and surfaces corpus overlap findings', async () => {
    const { SemanticAnalyzer } = await import('../src/analyzers/semantic.js')
    const toolStarts: string[] = []
    const findingCodes: string[] = []
    const tools: ToolSchema[] = [
      {
        name: 'get_stock_price',
        description: 'Fetch the latest stock price.',
      },
      {
        name: 'get_company_info',
        description: 'Return company metadata.',
      },
    ]

    const report = await new SemanticAnalyzer({
      reporter: {
        onToolStart(event) {
          toolStarts.push(event.tool)
        },
        onFinding(event) {
          findingCodes.push(event.finding.code)
        },
      },
    }).analyze('demo-server', tools)

    expect(toolStarts).toEqual(['get_stock_price', 'get_company_info'])
    expect(findingCodes).toContain('SEMANTIC_OVERLAP')
    expect(report.findings.some(finding => finding.code === 'SEMANTIC_OVERLAP')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { ParameterSemanticAnalyzer } from '../src/analyzers/parameter-semantic.js'
import type { ToolSchema } from '../src/types.js'

const nicheConflictTools: ToolSchema[] = [
  {
    name: 'list_portfolios',
    description: 'Returns holdings for a set of customer portfolios.',
    inputSchema: {
      type: 'object',
      properties: {
        portfolio_ids: {
          type: 'array',
          description: 'Portfolio identifiers to load.',
        },
      },
    },
  },
  {
    name: 'summarize_allocations',
    description: 'Summarizes holdings across provided positions.',
    inputSchema: {
      type: 'object',
      properties: {
        holdings: {
          type: 'array',
          description: 'Holdings to summarize.',
        },
      },
    },
  },
]

const staticConflictTools: ToolSchema[] = [
  {
    name: 'list_investments',
    description: 'Lists investments.',
    inputSchema: {
      type: 'object',
      properties: {
        investment_ids: {
          type: 'array',
          description: 'Investment identifiers.',
        },
      },
    },
  },
  {
    name: 'summarize_holdings',
    description: 'Summarizes holdings.',
    inputSchema: {
      type: 'object',
      properties: {
        investments: {
          type: 'array',
          description: 'Investments to summarize.',
        },
      },
    },
  },
]

const fakeEmbedder = async (text: string): Promise<Float32Array> => {
  if (text.includes('portfolio_ids')) return Float32Array.from([1, 0])
  if (text.includes('holdings')) return Float32Array.from([0.97, 0.12])
  if (text.includes('investment_ids')) return Float32Array.from([0.99, 0.01])
  if (text.includes('investments')) return Float32Array.from([0.98, 0.02])
  return Float32Array.from([0, 1])
}

describe('ParameterSemanticAnalyzer', () => {
  it('flags niche parameter aliases that static normalization misses', async () => {
    const findings = await new ParameterSemanticAnalyzer({
      threshold: 0.9,
      embedFn: fakeEmbedder,
    }).analyze('portfolio-server', nicheConflictTools)

    expect(findings).toHaveLength(1)
    expect(findings[0].code).toBe('SEMANTIC_PARAMETER_CONFLICT')
    expect(findings[0].tool).toBe('list_portfolios')
    expect(findings[0].matchedTool).toBe('summarize_allocations')
    expect(findings[0].matchedParameter).toBe('holdings')
  })

  it('skips conflicts already covered by static normalization', async () => {
    const findings = await new ParameterSemanticAnalyzer({
      threshold: 0.9,
      embedFn: fakeEmbedder,
    }).analyze('investment-server', staticConflictTools)

    expect(findings).toHaveLength(0)
  })

  it('ignores incompatible parameter types', async () => {
    const findings = await new ParameterSemanticAnalyzer({
      threshold: 0.9,
      embedFn: fakeEmbedder,
    }).analyze('mixed-server', [
      {
        name: 'load_portfolios',
        description: 'Loads holdings.',
        inputSchema: {
          type: 'object',
          properties: {
            portfolio_ids: {
              type: 'array',
              description: 'Portfolio identifiers.',
            },
          },
        },
      },
      {
        name: 'get_portfolio_count',
        description: 'Counts holdings.',
        inputSchema: {
          type: 'object',
          properties: {
            holdings: {
              type: 'number',
              description: 'Number of holdings.',
            },
          },
        },
      },
    ])

    expect(findings).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { createProgressReporter, printHuman } from '../cli/output.js'
import type { Finding, SemanticFinding } from '../src/types.js'

function createBuffer() {
  let text = ''

  return {
    writer: {
      write(chunk: string) {
        text += chunk
      },
    },
    text: () => text,
  }
}

describe('CLI output helpers', () => {
  it('skips live progress output in JSON mode', () => {
    expect(createProgressReporter({ json: true })).toBeUndefined()
  })

  it('prints phase headers and clean-phase summaries in default live output', () => {
    const output = createBuffer()
    const reporter = createProgressReporter({
      writer: output.writer,
    })

    reporter?.onToolStart?.({ phase: 'static', tool: 'get_stock_price' })
    reporter?.onPhaseComplete?.({ phase: 'static', toolCount: 1, findingCount: 0 })
    reporter?.onToolStart?.({ phase: 'semantic', tool: 'get_stock_price' })
    reporter?.onPhaseComplete?.({ phase: 'semantic', toolCount: 1, findingCount: 0 })

    expect(output.text()).toContain('Static analysis')
    expect(output.text()).toContain('Semantic analysis')
    expect(output.text()).toContain('→ get_stock_price')
    expect(output.text()).toContain('✓ No static findings')
    expect(output.text()).toContain('✓ No semantic findings')
  })

  it('groups findings by tool in the default final report', () => {
    const finding: Finding = {
      code: 'PARAMETER_CONFLICT',
      severity: 'warning',
      tool: 'get_stock_price',
      relatedTool: 'get_earnings',
      message: "Parameter 'ticker' in 'get_stock_price' and 'symbol' in 'get_earnings' likely refer to the same concept — consider using consistent naming",
    }
    const output = createBuffer()
    printHuman('test-server', 2, [finding], [], {
      writer: output.writer,
    })

    expect(output.text()).toContain('Findings by tool')
    expect(output.text()).toContain('get_stock_price')
    expect(output.text()).toContain('Suggested fix: Align overlapping parameter names across related tools.')
    expect(output.text()).toContain('1 warning')
    expect(output.text()).toContain('0 notes')
  })

  it('prints live finding details and verbose replay when verbose mode is enabled', () => {
    const finding: SemanticFinding = {
      code: 'ALREADY_IN_CORPUS',
      severity: 'info',
      tool: 'get_stock_quote',
      matchedTool: 'get_stock_quote',
      matchedServer: 'yahoo-finance',
      matchedDisplayName: 'Yahoo Finance MCP',
      similarity: 1,
      message: 'unused in formatter',
    }
    const output = createBuffer()
    const reporter = createProgressReporter({ writer: output.writer, verbose: true })

    reporter?.onToolStart?.({ phase: 'semantic', tool: 'get_stock_quote' })
    reporter?.onFinding?.({ phase: 'semantic', finding })
    printHuman('stock_tools', 1, [], [finding], {
      writer: output.writer,
      verbose: true,
    })

    expect(output.text()).toContain('ℹ NOTE [get_stock_quote]  ALREADY_IN_CORPUS')
    expect(output.text()).toContain('Detailed findings')
    expect(output.text()).toContain('Note: Exact match with get_stock_quote in Yahoo Finance MCP (1.00).')
  })
})

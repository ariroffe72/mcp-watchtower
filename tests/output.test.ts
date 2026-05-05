import { describe, expect, it } from 'vitest'
import { createProgressReporter, printHuman } from '../cli/output.js'
import type { Finding } from '../src/types.js'

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

  it('prints phase headers in default live output', () => {
    const output = createBuffer()
    const reporter = createProgressReporter({
      writer: output.writer,
    })

    reporter?.onToolStart?.({ phase: 'static', tool: 'get_stock_price' })
    reporter?.onToolStart?.({ phase: 'semantic', tool: 'get_stock_price' })

    expect(output.text()).toContain('Static analysis')
    expect(output.text()).toContain('Semantic analysis')
    expect(output.text()).toContain('→ [static] get_stock_price')
    expect(output.text()).toContain('→ [semantic] get_stock_price')
  })

  it('repeats findings in the final report by default', () => {
    const finding: Finding = {
      code: 'PARAMETER_CONFLICT',
      severity: 'warning',
      tool: 'get_stock_price',
      relatedTool: 'get_earnings',
      message: "Parameter 'ticker' in 'get_stock_price' and 'symbol' in 'get_earnings' likely refer to the same concept — consider using consistent naming",
    }
    const output = createBuffer()
    const reporter = createProgressReporter({ writer: output.writer })

    reporter?.onToolStart?.({ phase: 'static', tool: 'get_stock_price' })
    reporter?.onFinding?.({ phase: 'static', finding })
    printHuman('test-server', 2, [finding], [], {
      writer: output.writer,
    })

    expect(output.text().match(/PARAMETER_CONFLICT/g)).toHaveLength(2)
    expect(output.text()).toContain('1 warning')
  })
})

import { describe, expect, it } from 'vitest'
import { StaticAnalyzer, buildScanReport, REPORT_VERSION } from '../src/index.js'
import type { SemanticReport, StaticReport, ToolSchema } from '../src/index.js'

describe('buildScanReport', () => {
  it('preserves legacy top-level fields and adds dashboard metadata', () => {
    const tools: ToolSchema[] = [
      {
        name: 'get_price',
        description: 'Gets a price.',
      },
      {
        name: 'get_price',
        description: 'Gets a price from another source.',
      },
      {
        name: 'search_news',
        description: 'Searches news.',
      },
    ]
    const staticReport = new StaticAnalyzer().analyze('demo-server', tools)
    const semanticReport: SemanticReport = {
      server: 'demo-server',
      toolCount: tools.length,
      scannedAt: '2025-01-02T00:00:00.000Z',
      findings: [
        {
          severity: 'warning',
          code: 'SEMANTIC_OVERLAP',
          tool: 'get_price',
          matchedTool: 'lookup_quote',
          matchedServer: 'corpus-server',
          matchedDisplayName: 'Corpus Server',
          similarity: 0.91,
          toolIndexes: [1],
          message: 'overlap',
        },
      ],
    }

    const report = buildScanReport({
      tools,
      staticReport,
      semanticReport,
      ranStatic: true,
      ranSemantic: true,
    })

    expect(report.server).toBe(staticReport.server)
    expect(report.toolCount).toBe(staticReport.toolCount)
    expect(report.findings).toBe(staticReport.findings)
    expect(report.passedAt).toBe(staticReport.passedAt)
    expect(report.semanticFindings).toBe(semanticReport.findings)

    expect(report.reportVersion).toBe(REPORT_VERSION)
    expect(report.tools).toEqual([
      { index: 0, name: 'get_price', description: 'Gets a price.' },
      { index: 1, name: 'get_price', description: 'Gets a price from another source.' },
      { index: 2, name: 'search_news', description: 'Searches news.' },
    ])

    expect(report.analysis.static).toEqual({
      status: 'completed',
      ran: true,
      toolCount: staticReport.toolCount,
      findingCount: staticReport.findings.length,
      completedAt: staticReport.passedAt,
    })
    expect(report.analysis.semantic).toEqual({
      status: 'completed',
      ran: true,
      toolCount: semanticReport.toolCount,
      findingCount: semanticReport.findings.length,
      completedAt: semanticReport.scannedAt,
    })

    const duplicateFinding = report.findings.find(finding => finding.code === 'DUPLICATE_TOOL_NAME')
    expect(duplicateFinding?.toolIndexes).toEqual([0, 1])
  })

  it('marks skipped phases without breaking legacy fields', () => {
    const staticReport: StaticReport = {
      server: 'demo-server',
      toolCount: 2,
      findings: [],
      passedAt: '2025-01-01T00:00:00.000Z',
    }

    const report = buildScanReport({
      tools: [
        { name: 'get_price', description: 'Gets a price.' },
        { name: 'search_news', description: 'Searches news.' },
      ],
      staticReport,
      ranStatic: false,
      ranSemantic: false,
    })

    expect(report.passedAt).toBe(staticReport.passedAt)
    expect(report.semanticFindings).toEqual([])
    expect(report.analysis.static).toEqual({
      status: 'skipped',
      ran: false,
      toolCount: 2,
      findingCount: 0,
      completedAt: undefined,
    })
    expect(report.analysis.semantic).toEqual({
      status: 'skipped',
      ran: false,
      toolCount: 2,
      findingCount: 0,
      completedAt: undefined,
    })
  })
})

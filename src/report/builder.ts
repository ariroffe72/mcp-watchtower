import { REPORT_VERSION } from '../types.js'
import type { ScanReport, SemanticReport, StaticReport, ToolSchema } from '../types.js'

interface BuildScanReportOptions {
  tools: ToolSchema[]
  staticReport: StaticReport
  semanticReport?: SemanticReport
  ranStatic: boolean
  ranSemantic: boolean
}

export function buildScanReport({
  tools,
  staticReport,
  semanticReport,
  ranStatic,
  ranSemantic,
}: BuildScanReportOptions): ScanReport {
  const semanticFindings = semanticReport?.findings ?? []

  return {
    ...staticReport,
    reportVersion: REPORT_VERSION,
    tools: tools.map((tool, index) => ({
      ...tool,
      index,
    })),
    analysis: {
      static: buildPhaseSummary(
        ranStatic,
        staticReport.toolCount,
        staticReport.findings.length,
        ranStatic ? staticReport.passedAt : undefined,
      ),
      semantic: buildPhaseSummary(
        ranSemantic,
        semanticReport?.toolCount ?? tools.length,
        semanticFindings.length,
        ranSemantic ? semanticReport?.scannedAt : undefined,
      ),
    },
    semanticFindings,
  }
}

function buildPhaseSummary(
  ran: boolean,
  toolCount: number,
  findingCount: number,
  completedAt?: string,
) {
  return {
    status: ran ? 'completed' : 'skipped',
    ran,
    toolCount,
    findingCount,
    completedAt,
  }
}

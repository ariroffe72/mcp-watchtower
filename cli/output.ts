import type {
  AnalysisPhase,
  AnalysisReporter,
  Finding,
  SemanticFinding,
} from '../src/index.js'

interface Writer {
  write(text: string): void
}

interface ProgressReporterOptions {
  json?: boolean
  verbose?: boolean
  writer?: Writer
}

interface HumanReportOptions {
  includeDetailedFindings?: boolean
  writer?: Writer
}

const SEVERITY_ICON: Record<string, string> = {
  critical: '✖',
  warning:  '⚠',
  info:     'ℹ',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICAL',
  warning:  'WARNING',
  info:     'INFO',
}

export function createProgressReporter(options: ProgressReporterOptions): AnalysisReporter | undefined {
  if (options.json) return undefined

  const writer = options.writer ?? process.stdout
  let lastPhase: AnalysisPhase | undefined
  let hasStarted = false

  return {
    onToolStart(event) {
      if (!hasStarted) {
        writer.write('\n')
        hasStarted = true
      }

      if (lastPhase !== event.phase) {
        if (lastPhase) {
          writer.write('\n')
        }

        writer.write(`${getPhaseLabel(event.phase)}\n`)
        writer.write('─────────────────────────────────────\n')
        lastPhase = event.phase
      }

      writer.write(`→ [${event.phase}] ${event.tool}\n`)
    },
    onFinding(event) {
      writeFinding(writer, event.finding)
    },
  }
}

export function printHuman(
  server: string,
  toolCount: number,
  findings: Finding[],
  semanticFindings: SemanticFinding[],
  options: HumanReportOptions = {},
): void {
  const writer = options.writer ?? process.stdout
  const combinedFindings: Array<Finding | SemanticFinding> = [...findings, ...semanticFindings]
  const criticals = findings.filter(f => f.severity === 'critical')
  const warnings = findings.filter(f => f.severity === 'warning').length + semanticFindings.filter(f => f.severity === 'warning').length
  const infos = findings.filter(f => f.severity === 'info').length + semanticFindings.filter(f => f.severity === 'info').length

  writer.write('\n')
  writer.write(`mcp-watchtower — ${server}\n`)
  writer.write(`${toolCount} tool${toolCount === 1 ? '' : 's'} scanned\n`)
  writer.write('\n')

  if (combinedFindings.length === 0) {
    writer.write('✔  No issues found\n\n')
    return
  }

  for (const finding of combinedFindings) {
    writeFinding(writer, finding)
  }

  writer.write('─────────────────────────────────────\n')
  writer.write(`${criticals.length} critical  ${warnings} warning  ${infos} info\n\n`)
}

export function isSemanticFinding(finding: Finding | SemanticFinding): finding is SemanticFinding {
  return 'matchedTool' in finding
}

function getPhaseLabel(phase: AnalysisPhase): string {
  return phase === 'static' ? 'Static analysis' : 'Semantic analysis'
}

function writeFinding(writer: Writer, finding: Finding | SemanticFinding): void {
  const icon = SEVERITY_ICON[finding.severity]
  const label = SEVERITY_LABEL[finding.severity]
  const tool = finding.tool ? ` [${finding.tool}]` : ''
  writer.write(`${icon} ${label}${tool}  ${finding.code}\n`)

  if (isSemanticFinding(finding)) {
    writer.write(
      `  ${finding.matchedParameter ? `${finding.matchedParameter} in ` : ''}${finding.matchedTool} in ${finding.matchedDisplayName} (similarity: ${finding.similarity.toFixed(2)})\n`,
    )
    writer.write(`  ${finding.message}\n`)
  } else {
    writer.write(`  ${finding.message}\n`)
  }

  if (!isSemanticFinding(finding) && finding.relatedTool) {
    writer.write(`  Related tool: ${finding.relatedTool}\n`)
  }

  writer.write('\n')
}

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
  writer?: Writer
  verbose?: boolean
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
  const verbose = options.verbose ?? false
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

      writer.write(`→ ${event.tool}\n`)
    },
    onFinding(event) {
      if (verbose) {
        writeFindingDetails(writer, event.finding)
      }
    },
    onPhaseComplete(event) {
      writer.write(`✓ ${formatPhaseCompletion(event.phase, event.findingCount)}\n`)
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
  const counts = countSeverities(combinedFindings)

  writer.write('\n')
  writer.write(`mcp-watchtower — ${server}\n`)
  writer.write(`${toolCount} tool${toolCount === 1 ? '' : 's'} scanned\n`)
  writer.write('\n')

  if (combinedFindings.length === 0) {
    writer.write('✔  No issues found\n\n')
    return
  }

  writer.write('\n')
  writer.write('Findings by tool\n')
  writer.write('─────────────────────────────────────\n')
  writeGroupedSummary(writer, combinedFindings)
  if (options.verbose) {
    writer.write('Detailed findings\n')
    writer.write('─────────────────────────────────────\n')
    for (const finding of combinedFindings) {
      writeFindingDetails(writer, finding)
    }
  }

  writer.write('\n')
  writer.write('─────────────────────────────────────\n')
  writer.write(formatCounts(counts) + '\n\n')
}

export function isSemanticFinding(finding: Finding | SemanticFinding): finding is SemanticFinding {
  return 'matchedTool' in finding
}

function getPhaseLabel(phase: AnalysisPhase): string {
  return phase === 'static' ? 'Static analysis' : 'Semantic analysis'
}

function getEmptyPhaseMessage(phase: AnalysisPhase): string {
  return phase === 'static' ? 'No static findings' : 'No semantic findings'
}

function formatPhaseCompletion(phase: AnalysisPhase, findingCount: number): string {
  if (findingCount === 0) {
    return getEmptyPhaseMessage(phase)
  }

  return `${findingCount} ${phase} ${findingCount === 1 ? 'finding' : 'findings'} summarized below`
}

function writeGroupedSummary(writer: Writer, findings: Array<Finding | SemanticFinding>): void {
  const groups = new Map<string, Array<Finding | SemanticFinding>>()

  for (const finding of findings) {
    const key = finding.tool ?? '__server__'
    const entries = groups.get(key) ?? []
    entries.push(finding)
    groups.set(key, entries)
  }

  for (const [key, group] of groups) {
    writer.write(`${key === '__server__' ? 'Server-wide' : key}\n`)

    for (const finding of group) {
      writer.write(`  ${formatSummaryLine(finding)}\n`)
    }

    const suggestion = getSuggestedFix(group)
    if (suggestion) {
      writer.write(`  Suggested fix: ${suggestion}\n`)
    }

    writer.write('\n')
  }
}

function writeFindingDetails(writer: Writer, finding: Finding | SemanticFinding): void {
  const icon = SEVERITY_ICON[finding.severity]
  const label = getSeverityLabel(finding.severity)
  const tool = finding.tool ? ` [${finding.tool}]` : ''
  writer.write(`${icon} ${label}${tool}  ${finding.code}\n`)
  writer.write(`  ${formatDetailedMessage(finding)}\n`)

  if (!isSemanticFinding(finding) && finding.relatedTool) {
    writer.write(`  Related tool: ${finding.relatedTool}\n`)
  }

  writer.write('\n')
}

function getSeverityLabel(severity: Finding['severity'] | SemanticFinding['severity']): string {
  return severity === 'info' ? 'NOTE' : SEVERITY_LABEL[severity]
}

function formatSummaryLine(finding: Finding | SemanticFinding): string {
  const label = finding.severity === 'info' ? 'Note' : finding.severity === 'critical' ? 'Critical' : 'Warning'

  if (!isSemanticFinding(finding)) {
    return `${label}: ${finding.message}`
  }

  if (finding.code === 'ALREADY_IN_CORPUS') {
    return `${label}: Exact match with ${finding.matchedTool} in ${finding.matchedDisplayName} (${finding.similarity.toFixed(2)}). Likely intentional if this is your server.`
  }

  if (finding.code === 'SEMANTIC_OVERLAP') {
    return `${label}: Similar to ${finding.matchedTool} in ${finding.matchedDisplayName} (${finding.similarity.toFixed(2)}).`
  }

  return `${label}: ${finding.message}`
}

function formatDetailedMessage(finding: Finding | SemanticFinding): string {
  if (!isSemanticFinding(finding)) {
    return finding.message
  }

  if (finding.code === 'ALREADY_IN_CORPUS') {
    return `Exact match with ${finding.matchedTool} in ${finding.matchedDisplayName} (${finding.similarity.toFixed(2)}). Likely intentional if this is your server.`
  }

  if (finding.code === 'SEMANTIC_OVERLAP') {
    return `Similar to ${finding.matchedTool} in ${finding.matchedDisplayName} (${finding.similarity.toFixed(2)}). Consider clarifying the description.`
  }

  const matchTarget = finding.matchedParameter
    ? `${finding.matchedParameter} in ${finding.matchedTool}`
    : `${finding.matchedTool} in ${finding.matchedDisplayName}`
  return `${finding.message} Match: ${matchTarget} (${finding.similarity.toFixed(2)}).`
}

function getSuggestedFix(findings: Array<Finding | SemanticFinding>): string | undefined {
  if (findings.some(finding => isSemanticFinding(finding) && finding.code === 'SEMANTIC_PARAMETER_CONFLICT')) {
    return 'Use more specific parameter names or clearer parameter descriptions for overlapping concepts.'
  }

  if (findings.some(finding => isSemanticFinding(finding) && finding.code === 'SEMANTIC_OVERLAP')) {
    return 'Clarify the description with the exact scope, data source, or constraints that make this tool distinct.'
  }

  if (findings.some(finding => !isSemanticFinding(finding) && finding.code === 'PARAMETER_CONFLICT')) {
    return 'Align overlapping parameter names across related tools.'
  }

  return undefined
}

function countSeverities(findings: Array<Finding | SemanticFinding>): Record<'critical' | 'warning' | 'info', number> {
  return findings.reduce<Record<'critical' | 'warning' | 'info', number>>((counts, finding) => {
    counts[finding.severity] += 1
    return counts
  }, { critical: 0, warning: 0, info: 0 })
}

function formatCounts(counts: Record<'critical' | 'warning' | 'info', number>): string {
  return `${counts.critical} critical  ${pluralize(counts.warning, 'warning')}  ${pluralize(counts.info, 'note')}`
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

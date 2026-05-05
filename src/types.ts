/** A single tool as declared in an MCP server manifest */
export interface ToolSchema {
  name: string
  description: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

/** A single finding produced by the StaticAnalyzer */
export interface Finding {
  /** Severity of the finding */
  severity: 'critical' | 'warning' | 'info'
  /** Machine-readable finding code, e.g. 'DUPLICATE_TOOL_NAME' */
  code: string
  message: string
  /** Name of the tool that triggered this finding, if applicable */
  tool?: string
  /** Second tool involved, for conflict findings */
  relatedTool?: string
}

export type AnalysisPhase = 'static' | 'semantic'

export interface AnalysisToolStartEvent {
  phase: AnalysisPhase
  tool: string
}

export interface StaticAnalysisFindingEvent {
  phase: 'static'
  finding: Finding
}

export interface SemanticAnalysisFindingEvent {
  phase: 'semantic'
  finding: SemanticFinding
}

export type AnalysisFindingEvent =
  | StaticAnalysisFindingEvent
  | SemanticAnalysisFindingEvent

export interface AnalysisReporter {
  onToolStart?(event: AnalysisToolStartEvent): void
  onFinding?(event: AnalysisFindingEvent): void
}

/** The full analysis report returned by StaticAnalyzer.analyze() */
export interface StaticReport {
  server: string
  toolCount: number
  findings: Finding[]
  /** ISO timestamp of when the analysis completed */
  passedAt: string
}

/** Configuration options for StaticAnalyzer */
export interface StaticAnalyzerConfig {
  /** Elevates name collision severity to critical. Use when loading multiple servers simultaneously. */
  platform?: boolean
  /** Warn when tool count exceeds this threshold. Default: 20 */
  maxTools?: number
  /** Receives per-tool progress and findings as the scan runs. */
  reporter?: AnalysisReporter
}

export interface SemanticFinding {
  severity: 'warning' | 'info'
  code: 'SEMANTIC_OVERLAP' | 'ALREADY_IN_CORPUS' | 'SEMANTIC_PARAMETER_CONFLICT'
  tool: string
  matchedTool: string
  matchedServer: string
  matchedDisplayName: string
  matchedParameter?: string
  similarity: number
  message: string
}

export interface SemanticReport {
  server: string
  toolCount: number
  findings: SemanticFinding[]
  scannedAt: string
}

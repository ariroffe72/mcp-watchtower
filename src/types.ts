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
}

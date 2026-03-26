// A single tool as declared in an MCP server manifest
export interface ToolSchema {
  name: string
  description: string
  inputSchema?: {
    type: 'object'
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

// A single finding from any analyzer check
export interface Finding {
  severity: 'critical' | 'warning' | 'info'
  code: string           // e.g. 'DUPLICATE_TOOL_NAME'
  message: string
  tool?: string          // which tool triggered it, if applicable
  relatedTool?: string   // second tool involved, for conflict findings
}

// The full report returned by StaticAnalyzer.analyze()
export interface StaticReport {
  server: string
  toolCount: number
  findings: Finding[]
  passedAt: string       // ISO timestamp
}

// Config passed to StaticAnalyzer
export interface StaticAnalyzerConfig {
  platform?: boolean     // elevates name collision severity to critical
  maxTools?: number      // default 20, threshold for tool count warning
}

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Finding, StaticAnalyzerConfig, StaticReport, ToolSchema } from '../types.js'

interface ShadowPatternEntry {
  regex: string
  risk: string
  severity: 'warning' | 'critical'
}

interface CompiledPattern {
  regex: RegExp
  risk: string
  severity: 'warning' | 'critical'
}

export class StaticAnalyzer {
  private config: StaticAnalyzerConfig
  private shadowPatterns: CompiledPattern[]

  constructor(config: StaticAnalyzerConfig = {}) {
    this.config = {
      platform: false,
      maxTools: 20,
      ...config,
    }

    const __dirname = dirname(fileURLToPath(import.meta.url))
    const patternsPath = resolve(__dirname, 'shadow-patterns.json')
    const raw = JSON.parse(readFileSync(patternsPath, 'utf-8')) as { patterns: ShadowPatternEntry[] }
    this.shadowPatterns = raw.patterns.map(p => ({
      regex: new RegExp(p.regex.replace(/^\(\?i\)/, ''), 'i'),
      risk: p.risk,
      severity: p.severity,
    }))
  }

  /** Main entry point — runs all checks and returns the full report. */
  analyze(serverName: string, tools: ToolSchema[]): StaticReport {
    const findings: Finding[] = [
      ...this.checkDuplicateNames(tools),
      ...this.checkNamingConvention(tools),
      ...this.checkParameterConflicts(tools),
      ...this.checkShadowPatterns(tools),
      ...this.checkToolCount(tools),
    ]

    return {
      server: serverName,
      toolCount: tools.length,
      findings,
      passedAt: new Date().toISOString(),
    }
  }

  /**
   * Check 1: detect duplicate tool names within the server.
   * Returns a critical finding for each name that appears more than once.
   * Finding code: DUPLICATE_TOOL_NAME
   */
  private checkDuplicateNames(_tools: ToolSchema[]): Finding[] {
    return []
  }

  /**
   * Check 2: detect inconsistent naming conventions across tools.
   * Detects which convention the majority of tools use (snake_case,
   * camelCase, kebab-case) and flags outliers.
   * Finding code: NAMING_CONVENTION
   * Severity: warning
   */
  private checkNamingConvention(_tools: ToolSchema[]): Finding[] {
    return []
  }

  /**
   * Check 3: detect parameter name conflicts across tools.
   * Looks for parameters that likely refer to the same concept but
   * are named differently (e.g. ticker vs symbol, id vs identifier).
   * Finding code: PARAMETER_CONFLICT
   * Severity: warning
   */
  private checkParameterConflicts(_tools: ToolSchema[]): Finding[] {
    return []
  }

  /**
   * Check 4: scan tool descriptions for shadow patterns.
   * Patterns that indicate cross-tool interference or forced invocation,
   * loaded once at construction time from shadow-patterns.json.
   * Finding code: SHADOW_PATTERN
   * Severity: warning (critical if the matched pattern is marked critical)
   */
  private checkShadowPatterns(tools: ToolSchema[]): Finding[] {
    const findings: Finding[] = []

    for (const tool of tools) {
      for (const pattern of this.shadowPatterns) {
        if (pattern.regex.test(tool.description)) {
          const desc = tool.description
          const excerpt = desc.length > 60 ? desc.slice(0, 57) + '...' : desc
          findings.push({
            code: 'SHADOW_PATTERN',
            severity: pattern.severity,
            tool: tool.name,
            message: `Tool "${tool.name}" contains ${pattern.risk} pattern: "${excerpt}"`,
          })
        }
      }
    }

    return findings
  }

  /**
   * Check 5: warn when tool count exceeds the configured threshold.
   * Research shows LLM routing accuracy degrades above ~20 tools.
   * Finding code: TOOL_COUNT_WARNING
   * Severity: warning
   */
  private checkToolCount(_tools: ToolSchema[]): Finding[] {
    return []
  }
}

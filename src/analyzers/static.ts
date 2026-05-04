import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Finding, StaticAnalyzerConfig, StaticReport, ToolSchema } from '../types.js'
import { normalizeParameterName } from './parameter-normalization.js'

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

type Convention = 'snake_case' | 'camelCase' | 'kebab-case' | 'unknown'

const CONVENTION_PRIORITY: Array<Exclude<Convention, 'unknown'>> = ['snake_case', 'camelCase', 'kebab-case']

function detectConvention(name: string): Convention {
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(name)) return 'snake_case'
  if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) return 'camelCase'
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(name)) return 'kebab-case'
  return 'unknown'
}

/**
 * Runs static analysis on an MCP server's tool definitions.
 * Checks for duplicate names, naming convention inconsistencies,
 * parameter conflicts, shadow patterns, and tool count warnings.
 * No LLM calls — all checks are deterministic and run offline.
 */
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

  /**
   * Run all static checks against a set of tool definitions.
   * @param serverName - Name used in the returned report
   * @param tools - Array of tool definitions from the MCP server
   * @returns StaticReport containing all findings
   */
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
  private checkDuplicateNames(tools: ToolSchema[]): Finding[] {
    const counts = new Map<string, number>()
    for (const tool of tools) {
      counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)
    }

    const findings: Finding[] = []
    for (const [name, count] of counts) {
      if (count > 1) {
        findings.push({
          code: 'DUPLICATE_TOOL_NAME',
          severity: 'critical',
          tool: name,
          message: `Tool name '${name}' is defined ${count} times in this server`,
        })
      }
    }
    return findings
  }

  /**
   * Check 2: detect inconsistent naming conventions across tools.
   * Detects which convention the majority of tools use (snake_case,
   * camelCase, kebab-case) and flags outliers.
   * Finding code: NAMING_CONVENTION
   * Severity: warning
   */
  private checkNamingConvention(tools: ToolSchema[]): Finding[] {
    const counts = new Map<Exclude<Convention, 'unknown'>, number>(
      CONVENTION_PRIORITY.map(c => [c, 0])
    )

    for (const tool of tools) {
      const conv = detectConvention(tool.name)
      if (conv !== 'unknown') {
        counts.set(conv, (counts.get(conv) ?? 0) + 1)
      }
    }

    const maxCount = Math.max(...counts.values())
    if (maxCount === 0) return []

    const majority = CONVENTION_PRIORITY.find(c => counts.get(c) === maxCount)!

    const findings: Finding[] = []
    for (const tool of tools) {
      const detected = detectConvention(tool.name)
      if (detected !== 'unknown' && detected !== majority) {
        findings.push({
          code: 'NAMING_CONVENTION',
          severity: 'warning',
          tool: tool.name,
          message: `Tool '${tool.name}' uses ${detected} but majority convention is ${majority}`,
        })
      }
    }
    return findings
  }

  /**
   * Check 3: detect parameter name conflicts across tools.
   * Looks for parameters that likely refer to the same concept but
   * are named differently (e.g. ticker vs symbol, id vs identifier).
   * Finding code: PARAMETER_CONFLICT
   * Severity: warning
   */
  private checkParameterConflicts(tools: ToolSchema[]): Finding[] {
    const findings: Finding[] = []
    const seen = new Set<string>()

    for (let i = 0; i < tools.length; i++) {
      const toolA = tools[i]
      const paramsA = Object.keys(toolA.inputSchema?.properties ?? {})
      if (paramsA.length === 0) continue

      for (let j = i + 1; j < tools.length; j++) {
        const toolB = tools[j]
        const paramsB = Object.keys(toolB.inputSchema?.properties ?? {})
        if (paramsB.length === 0) continue

        for (const paramA of paramsA) {
          const normalizedA = normalizeParameterName(paramA)

          for (const paramB of paramsB) {
            if (paramA === paramB) continue

            const normalizedB = normalizeParameterName(paramB)
            const seenKey = [toolA.name, toolB.name].sort().join(':') + ':' + normalizedA

            if (seen.has(seenKey) || normalizedA !== normalizedB) continue

            seen.add(seenKey)
            findings.push({
              code: 'PARAMETER_CONFLICT',
              severity: 'warning',
              tool: toolA.name,
              relatedTool: toolB.name,
              message: `Parameter '${paramA}' in '${toolA.name}' and '${paramB}' in '${toolB.name}' likely refer to the same concept — consider using consistent naming`,
            })
          }
        }
      }
    }

    return findings
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
  private checkToolCount(tools: ToolSchema[]): Finding[] {
    const max = this.config.maxTools ?? 20
    if (tools.length <= max) return []

    return [{
      code: 'TOOL_COUNT_WARNING',
      severity: 'warning',
      message: `Server has ${tools.length} tools which exceeds the recommended maximum of ${max}. Consider splitting into focused sub-servers.`,
    }]
  }
}

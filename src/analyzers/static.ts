import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AnalysisPhase, Finding, StaticAnalyzerConfig, StaticReport, ToolSchema } from '../types.js'
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
    const findings: Finding[] = []
    const duplicateCounts = countToolNames(tools)
    const majorityConvention = determineMajorityConvention(tools)
    const emittedDuplicateNames = new Set<string>()

    for (let index = 0; index < tools.length; index += 1) {
      const tool = tools[index]
      this.reportToolStart(tool.name)
      this.recordFindings(findings, this.checkDuplicateName(tool, duplicateCounts, emittedDuplicateNames))
      this.recordFindings(findings, this.checkNamingConvention(tool, majorityConvention))
      this.recordFindings(findings, this.checkParameterConflicts(tool, index, tools))
      this.recordFindings(findings, this.checkShadowPatterns(tool))
    }

    this.recordFindings(findings, this.checkToolCount(tools))

    return {
      server: serverName,
      toolCount: tools.length,
      findings,
      passedAt: new Date().toISOString(),
    }
  }

  private recordFindings(target: Finding[], next: Finding[]): void {
    target.push(...next)

    for (const finding of next) {
      this.config.reporter?.onFinding?.({
        phase: 'static',
        finding,
      })
    }
  }

  private reportToolStart(tool: string): void {
    this.config.reporter?.onToolStart?.({
      phase: 'static' satisfies AnalysisPhase,
      tool,
    })
  }

  /**
   * Check 1: detect duplicate tool names within the server.
   * Returns a critical finding for each name that appears more than once.
   * Finding code: DUPLICATE_TOOL_NAME
   */
  private checkDuplicateName(
    tool: ToolSchema,
    counts: Map<string, number>,
    emitted: Set<string>,
  ): Finding[] {
    const count = counts.get(tool.name) ?? 0
    if (count <= 1 || emitted.has(tool.name)) return []

    emitted.add(tool.name)
    return [{
      code: 'DUPLICATE_TOOL_NAME',
      severity: 'critical',
      tool: tool.name,
      message: `Tool name '${tool.name}' is defined ${count} times in this server`,
    }]
  }

  /**
   * Check 2: detect inconsistent naming conventions across tools.
   * Detects which convention the majority of tools use (snake_case,
   * camelCase, kebab-case) and flags outliers.
   * Finding code: NAMING_CONVENTION
   * Severity: warning
   */
  private checkNamingConvention(tool: ToolSchema, majority: Convention | null): Finding[] {
    if (majority === null) return []

    const detected = detectConvention(tool.name)
    if (detected === 'unknown' || detected === majority) return []

    return [{
      code: 'NAMING_CONVENTION',
      severity: 'warning',
      tool: tool.name,
      message: `Tool '${tool.name}' uses ${detected} but majority convention is ${majority}`,
    }]
  }

  /**
   * Check 3: detect parameter name conflicts across tools.
   * Looks for parameters that likely refer to the same concept but
   * are named differently (e.g. ticker vs symbol, id vs identifier).
   * Finding code: PARAMETER_CONFLICT
   * Severity: warning
   */
  private checkParameterConflicts(toolA: ToolSchema, toolAIndex: number, tools: ToolSchema[]): Finding[] {
    const findings: Finding[] = []
    const seen = new Set<string>()

    const paramsA = Object.keys(toolA.inputSchema?.properties ?? {})
    if (paramsA.length === 0) return findings

    for (let j = toolAIndex + 1; j < tools.length; j += 1) {
      const toolB = tools[j]
      const paramsB = Object.keys(toolB.inputSchema?.properties ?? {})
      if (paramsB.length === 0) continue

      for (const paramA of paramsA) {
        const normalizedA = normalizeParameterName(paramA)

        for (const paramB of paramsB) {
          if (paramA === paramB) continue

          const normalizedB = normalizeParameterName(paramB)
          const seenKey = `${toolAIndex}:${j}:${normalizedA}`

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

    return findings
  }

  /**
   * Check 4: scan tool descriptions for shadow patterns.
   * Patterns that indicate cross-tool interference or forced invocation,
   * loaded once at construction time from shadow-patterns.json.
   * Finding code: SHADOW_PATTERN
   * Severity: warning (critical if the matched pattern is marked critical)
   */
  private checkShadowPatterns(tool: ToolSchema): Finding[] {
    const findings: Finding[] = []

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

function countToolNames(tools: ToolSchema[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const tool of tools) {
    counts.set(tool.name, (counts.get(tool.name) ?? 0) + 1)
  }

  return counts
}

function determineMajorityConvention(tools: ToolSchema[]): Convention | null {
  const counts = new Map<Exclude<Convention, 'unknown'>, number>(
    CONVENTION_PRIORITY.map(convention => [convention, 0]),
  )

  for (const tool of tools) {
    const convention = detectConvention(tool.name)
    if (convention !== 'unknown') {
      counts.set(convention, (counts.get(convention) ?? 0) + 1)
    }
  }

  const maxCount = Math.max(...counts.values())
  if (maxCount === 0) return null

  return CONVENTION_PRIORITY.find(convention => counts.get(convention) === maxCount) ?? null
}

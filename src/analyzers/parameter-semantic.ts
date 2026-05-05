import { embed as defaultEmbed } from '../embeddings/provider.js'
import type { AnalysisPhase, AnalysisReporter, SemanticFinding, ToolSchema } from '../types.js'
import { normalizeParameterName } from './parameter-normalization.js'

const DEFAULT_PARAMETER_THRESHOLD = 0.88

type EmbedFn = (text: string) => Promise<Float32Array>

interface ParameterSemanticAnalyzerConfig {
  threshold?: number
  embedFn?: EmbedFn
  reporter?: AnalysisReporter
  emitToolStarts?: boolean
}

interface ParameterCandidate {
  toolIndex: number
  toolName: string
  toolDescription: string
  name: string
  normalizedName: string
  type?: string
  description: string
  context: string
}

interface ParameterAnalysisContext {
  candidatesByTool: Map<number, ParameterCandidate[]>
  embeddingCache: Map<string, Float32Array>
  seen: Set<string>
}

interface AnalyzeToolOptions {
  reportToolStart?: boolean
}

export class ParameterSemanticAnalyzer {
  private readonly threshold: number
  private readonly embedFn: EmbedFn
  private readonly reporter?: AnalysisReporter
  private readonly emitToolStarts: boolean

  constructor(config: ParameterSemanticAnalyzerConfig = {}) {
    this.threshold = Number.isFinite(config.threshold) ? Number(config.threshold) : DEFAULT_PARAMETER_THRESHOLD
    this.embedFn = config.embedFn ?? defaultEmbed
    this.reporter = config.reporter
    this.emitToolStarts = config.emitToolStarts ?? true
  }

  async analyze(serverName: string, tools: ToolSchema[]): Promise<SemanticFinding[]> {
    const context = this.createContext(tools)
    const findings: SemanticFinding[] = []

    for (let toolIndex = 0; toolIndex < tools.length; toolIndex += 1) {
      const toolFindings = await this.analyzeTool(serverName, tools, toolIndex, context)
      findings.push(...toolFindings)
    }

    return findings.sort((left, right) => right.similarity - left.similarity)
  }

  createContext(tools: ToolSchema[]): ParameterAnalysisContext {
    const candidates = collectParameters(tools)
    const candidatesByTool = new Map<number, ParameterCandidate[]>()

    for (const candidate of candidates) {
      const entries = candidatesByTool.get(candidate.toolIndex) ?? []
      entries.push(candidate)
      candidatesByTool.set(candidate.toolIndex, entries)
    }

    return {
      candidatesByTool,
      embeddingCache: new Map<string, Float32Array>(),
      seen: new Set<string>(),
    }
  }

  async analyzeTool(
    serverName: string,
    tools: ToolSchema[],
    toolIndex: number,
    context = this.createContext(tools),
    options: AnalyzeToolOptions = {},
  ): Promise<SemanticFinding[]> {
    const tool = tools[toolIndex]
    if (!tool) return []

    if (options.reportToolStart ?? this.emitToolStarts) {
      this.reportToolStart(tool.name)
    }

    const leftCandidates = context.candidatesByTool.get(toolIndex) ?? []
    const findings: SemanticFinding[] = []

    for (const left of leftCandidates) {
      for (let otherToolIndex = toolIndex + 1; otherToolIndex < tools.length; otherToolIndex += 1) {
        const rightCandidates = context.candidatesByTool.get(otherToolIndex) ?? []

        for (const right of rightCandidates) {
          if (left.name === right.name) continue
          if (left.normalizedName === right.normalizedName) continue
          if (!isTypeCompatible(left.type, right.type)) continue

          const similarity = roundSimilarity(await cosineSimilarity(
            await getEmbedding(left.context, context.embeddingCache, this.embedFn),
            await getEmbedding(right.context, context.embeddingCache, this.embedFn),
          ))

          if (similarity < this.threshold) continue

          const seenKey = `${toolIndex}:${otherToolIndex}:${[left.name, right.name].sort().join(':')}`
          if (context.seen.has(seenKey)) continue

          context.seen.add(seenKey)
          const finding: SemanticFinding = {
            severity: 'warning',
            code: 'SEMANTIC_PARAMETER_CONFLICT',
            tool: left.toolName,
            matchedTool: right.toolName,
            matchedServer: serverName,
            matchedDisplayName: serverName,
            matchedParameter: right.name,
            similarity,
            message: `Parameter '${left.name}' in '${left.toolName}' is semantically similar to '${right.name}' in '${right.toolName}' (similarity: ${similarity.toFixed(2)}) — consider using a shared name or clearer descriptions`,
          }

          findings.push(finding)
          this.reportFinding(finding)
        }
      }
    }

    return findings
  }

  private reportToolStart(tool: string): void {
    this.reporter?.onToolStart?.({
      phase: 'semantic' satisfies AnalysisPhase,
      tool,
    })
  }

  private reportFinding(finding: SemanticFinding): void {
    this.reporter?.onFinding?.({
      phase: 'semantic',
      finding,
    })
  }
}

function collectParameters(tools: ToolSchema[]): ParameterCandidate[] {
  return tools.flatMap((tool, toolIndex) =>
    Object.entries(tool.inputSchema?.properties ?? {}).map(([name, schema]) => ({
      toolIndex,
      toolName: tool.name,
      toolDescription: tool.description.trim(),
      name,
      normalizedName: normalizeParameterName(name),
      type: schema.type,
      description: schema.description?.trim() ?? '',
      context: buildParameterContext(tool, name, schema.type, schema.description),
    }))
  )
}

function buildParameterContext(
  tool: ToolSchema,
  parameterName: string,
  parameterType?: string,
  parameterDescription?: string,
): string {
  return [
    `parameter ${parameterName}`,
    parameterType ? `type ${parameterType}` : '',
    parameterDescription?.trim() ? `parameter description ${parameterDescription.trim()}` : '',
    tool.name.trim() ? `tool ${tool.name.trim()}` : '',
    tool.description.trim() ? `tool description ${tool.description.trim()}` : '',
  ].filter(Boolean).join('. ')
}

async function getEmbedding(
  text: string,
  cache: Map<string, Float32Array>,
  embedFn: EmbedFn,
): Promise<Float32Array> {
  const cached = cache.get(text)
  if (cached) return cached

  const embedding = await embedFn(text)
  cache.set(text, embedding)
  return embedding
}

async function cosineSimilarity(left: Float32Array, right: Float32Array): Promise<number> {
  if (left.length !== right.length) {
    throw new Error(`Embedding length mismatch: ${left.length} vs ${right.length}`)
  }

  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let i = 0; i < left.length; i += 1) {
    dotProduct += left[i] * right[i]
    leftMagnitude += left[i] * left[i]
    rightMagnitude += right[i] * right[i]
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new Error('Cannot compute cosine similarity for a zero-magnitude embedding')
  }

  return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude)
}

function isTypeCompatible(left?: string, right?: string): boolean {
  if (!left || !right) return true
  return left === right
}

function roundSimilarity(value: number): number {
  return Math.round(value * 100) / 100
}

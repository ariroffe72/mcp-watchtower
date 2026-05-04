import { embed as defaultEmbed } from '../embeddings/provider.js'
import type { SemanticFinding, ToolSchema } from '../types.js'
import { normalizeParameterName } from './parameter-normalization.js'

const DEFAULT_PARAMETER_THRESHOLD = 0.88

type EmbedFn = (text: string) => Promise<Float32Array>

interface ParameterSemanticAnalyzerConfig {
  threshold?: number
  embedFn?: EmbedFn
}

interface ParameterCandidate {
  toolName: string
  toolDescription: string
  name: string
  normalizedName: string
  type?: string
  description: string
  context: string
}

export class ParameterSemanticAnalyzer {
  private readonly threshold: number
  private readonly embedFn: EmbedFn

  constructor(config: ParameterSemanticAnalyzerConfig = {}) {
    this.threshold = Number.isFinite(config.threshold) ? Number(config.threshold) : DEFAULT_PARAMETER_THRESHOLD
    this.embedFn = config.embedFn ?? defaultEmbed
  }

  async analyze(serverName: string, tools: ToolSchema[]): Promise<SemanticFinding[]> {
    const candidates = collectParameters(tools)
    const findings: SemanticFinding[] = []
    const embeddingCache = new Map<string, Float32Array>()
    const seen = new Set<string>()

    for (let i = 0; i < candidates.length; i += 1) {
      const left = candidates[i]

      for (let j = i + 1; j < candidates.length; j += 1) {
        const right = candidates[j]

        if (left.toolName === right.toolName) continue
        if (left.name === right.name) continue
        if (left.normalizedName === right.normalizedName) continue
        if (!isTypeCompatible(left.type, right.type)) continue

        const similarity = roundSimilarity(await cosineSimilarity(
          await getEmbedding(left.context, embeddingCache, this.embedFn),
          await getEmbedding(right.context, embeddingCache, this.embedFn),
        ))

        if (similarity < this.threshold) continue

        const seenKey = [left.toolName, right.toolName].sort().join(':') + ':' + [left.name, right.name].sort().join(':')
        if (seen.has(seenKey)) continue

        seen.add(seenKey)
        findings.push({
          severity: 'warning',
          code: 'SEMANTIC_PARAMETER_CONFLICT',
          tool: left.toolName,
          matchedTool: right.toolName,
          matchedServer: serverName,
          matchedDisplayName: serverName,
          matchedParameter: right.name,
          similarity,
          message: `Parameter '${left.name}' in '${left.toolName}' is semantically similar to '${right.name}' in '${right.toolName}' (similarity: ${similarity.toFixed(2)}) — consider using a shared name or clearer descriptions`,
        })
      }
    }

    return findings.sort((left, right) => right.similarity - left.similarity)
  }
}

function collectParameters(tools: ToolSchema[]): ParameterCandidate[] {
  return tools.flatMap(tool =>
    Object.entries(tool.inputSchema?.properties ?? {}).map(([name, schema]) => ({
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

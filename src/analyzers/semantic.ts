import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { embed, EMBEDDING_DIMENSIONS } from '../embeddings/provider.js'
import type { SemanticFinding, SemanticReport, ToolSchema } from '../types.js'
import { ParameterSemanticAnalyzer } from './parameter-semantic.js'

const require = createRequire(import.meta.url)
const { HierarchicalNSW } = require('hnswlib-node') as typeof import('hnswlib-node')

const DEFAULT_THRESHOLD = 0.75
const DEFAULT_TOP_K = 10

interface SemanticMetadata {
  server: string
  displayName: string
  toolName: string
  description: string
}

interface SemanticAnalyzerConfig {
  threshold?: number
  topK?: number
  parameterThreshold?: number
}

export class SemanticAnalyzer {
  private readonly threshold: number
  private readonly topK: number
  private readonly parameterThreshold: number
  private readonly index: import('hnswlib-node').HierarchicalNSW
  private readonly metadata: SemanticMetadata[]

  constructor(config: SemanticAnalyzerConfig = {}) {
    this.threshold = Number.isFinite(config.threshold) ? Number(config.threshold) : DEFAULT_THRESHOLD
    this.topK = Number.isInteger(config.topK) && Number(config.topK) > 0 ? Number(config.topK) : DEFAULT_TOP_K
    this.parameterThreshold = Number.isFinite(config.parameterThreshold)
      ? Number(config.parameterThreshold)
      : Math.max(this.threshold, 0.88)

    const metadataPath = resolveIndexPath('semantic-meta.json')
    const indexPath = resolveIndexPath('semantic.hnsw')

    this.metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as SemanticMetadata[]

    this.index = new HierarchicalNSW('cosine', EMBEDDING_DIMENSIONS)
    this.index.readIndexSync(indexPath)
    this.index.setEf(Math.max(this.topK, 50))

    if (this.index.getCurrentCount() !== this.metadata.length) {
      throw new Error(
        `Semantic index size (${this.index.getCurrentCount()}) does not match metadata size (${this.metadata.length})`,
      )
    }
  }

  async analyze(serverName: string, tools: ToolSchema[]): Promise<SemanticReport> {
    const findings: SemanticFinding[] = []
    const parameterFindings = await new ParameterSemanticAnalyzer({
      threshold: this.parameterThreshold,
    }).analyze(serverName, tools)
    const neighborCount = Math.min(this.topK, this.metadata.length)

    if (neighborCount === 0) {
      return {
        server: serverName,
        toolCount: tools.length,
        findings: parameterFindings,
        scannedAt: new Date().toISOString(),
      }
    }

    for (const tool of tools) {
      const description = tool.description.trim()
      if (description.length === 0) {
        continue
      }

      const descriptionEmbedding = await embed(description)
      const retrievalEmbedding = await embed(buildQueryText(tool))
      const result = this.index.searchKnn(Array.from(retrievalEmbedding), neighborCount)

      for (let i = 0; i < result.neighbors.length; i += 1) {
        const metadataIndex = result.neighbors[i]
        const matched = this.metadata[metadataIndex]
        if (!matched) {
          continue
        }

        const similarity = await computeSimilarity(tool, matched, result.distances[i], descriptionEmbedding)
        if (similarity < this.threshold || matched.server === serverName) {
          continue
        }

        findings.push(buildFinding(tool, matched, similarity))
      }
    }

    return {
      server: serverName,
      toolCount: tools.length,
      findings: [...parameterFindings, ...findings],
      scannedAt: new Date().toISOString(),
    }
  }
}

function roundSimilarity(value: number): number {
  return Math.round(value * 100) / 100
}

async function computeSimilarity(
  tool: ToolSchema,
  matched: SemanticMetadata,
  retrievalDistance: number,
  descriptionEmbedding: Float32Array,
): Promise<number> {
  let similarity = roundSimilarity(1 - retrievalDistance)

  if (tool.name.localeCompare(matched.toolName, undefined, { sensitivity: 'accent' }) === 0) {
    const matchedEmbedding = await embed(matched.description)
    similarity = roundSimilarity(cosineSimilarity(descriptionEmbedding, matchedEmbedding))
  }

  return similarity
}

function buildFinding(tool: ToolSchema, matched: SemanticMetadata, similarity: number): SemanticFinding {
  if (similarity >= 0.95 && tool.name.localeCompare(matched.toolName, undefined, { sensitivity: 'accent' }) === 0) {
    return {
      severity: 'info',
      code: 'ALREADY_IN_CORPUS',
      tool: tool.name,
      matchedTool: matched.toolName,
      matchedServer: matched.server,
      matchedDisplayName: matched.displayName,
      similarity,
      message: `'${tool.name}' already exists in the corpus as '${matched.toolName}' in ${matched.displayName} (similarity: ${similarity.toFixed(2)}) — if this is your server, no action needed`,
    }
  }

  return {
    severity: 'warning',
    code: 'SEMANTIC_OVERLAP',
    tool: tool.name,
    matchedTool: matched.toolName,
    matchedServer: matched.server,
    matchedDisplayName: matched.displayName,
    similarity,
    message: `'${tool.name}' is semantically similar to '${matched.toolName}' in ${matched.displayName} (similarity: ${similarity.toFixed(2)}) — consider adding disambiguation to your description`,
  }
}

function cosineSimilarity(left: Float32Array, right: Float32Array): number {
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

function buildQueryText(tool: ToolSchema): string {
  const toolName = tool.name.trim()
  return toolName.length > 0 ? `${toolName} ${tool.description.trim()}` : tool.description.trim()
}

function resolvePackageDataDir(): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))

  for (let current = __dirname; ; current = dirname(current)) {
    if (existsSync(resolve(current, 'package.json'))) {
      return resolve(current, 'src', 'data')
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }
  }

  throw new Error('Unable to locate package root for semantic index files')
}

function resolveIndexPath(filename: 'semantic.hnsw' | 'semantic-meta.json'): string {
  const local = join(homedir(), '.mcp-watchtower', 'index', filename)
  const bundled = resolve(resolvePackageDataDir(), filename)
  return existsSync(local) ? local : bundled
}

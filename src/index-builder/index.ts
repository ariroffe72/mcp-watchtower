import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { EMBEDDING_DIMENSIONS } from '../embeddings/provider.js'
import type { EmbeddedTool } from '../embeddings/index.js'

const require = createRequire(import.meta.url)
const { HierarchicalNSW } = require('hnswlib-node') as typeof import('hnswlib-node')

const SPACE_NAME = 'cosine'
const DEFAULT_M = 16
const DEFAULT_EF_CONSTRUCTION = 200
const DEFAULT_RANDOM_SEED = 100

export interface SemanticMetadata {
  server: string
  displayName: string
  toolName: string
  description: string
}

export interface IndexBuildResult {
  count: number
  indexPath: string
  metadataPath: string
}

export interface BuildIndexOptions {
  logger?: Pick<Console, 'log'>
}

export async function buildIndex(options: BuildIndexOptions = {}): Promise<IndexBuildResult> {
  const logger = options.logger
  const embeddingsPath = resolve(process.cwd(), 'src', 'data', 'embeddings.json')
  const indexPath = resolve(process.cwd(), 'src', 'data', 'semantic.hnsw')
  const metadataPath = resolve(process.cwd(), 'src', 'data', 'semantic-meta.json')
  const rawEmbeddings = await readFile(embeddingsPath, 'utf-8')
  const embeddings = JSON.parse(rawEmbeddings) as EmbeddedTool[]

  logger?.log(`[index] loaded ${embeddings.length} embeddings`)

  const index = new HierarchicalNSW(SPACE_NAME, EMBEDDING_DIMENSIONS)
  index.initIndex({
    maxElements: embeddings.length,
    m: DEFAULT_M,
    efConstruction: DEFAULT_EF_CONSTRUCTION,
    randomSeed: DEFAULT_RANDOM_SEED,
  })

  const metadata: SemanticMetadata[] = []

  for (let i = 0; i < embeddings.length; i += 1) {
    const entry = embeddings[i]

    if (entry.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS} values for ${entry.displayName}/${entry.toolName}, received ${entry.embedding.length}`,
      )
    }

    index.addPoint(entry.embedding, i)
    metadata.push({
      server: entry.server,
      displayName: entry.displayName,
      toolName: entry.toolName,
      description: entry.description,
    })

    if (i === 0 || (i + 1) % 100 === 0 || i + 1 === embeddings.length) {
      logger?.log(`[index] added ${i + 1}/${embeddings.length} embeddings`)
    }
  }

  await mkdir(dirname(indexPath), { recursive: true })
  index.writeIndexSync(indexPath)
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8')

  logger?.log('[index] wrote binary index to src/data/semantic.hnsw')
  logger?.log('[index] wrote metadata to src/data/semantic-meta.json')

  return {
    count: embeddings.length,
    indexPath,
    metadataPath,
  }
}

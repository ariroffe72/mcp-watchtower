import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Corpus } from '../crawler/index.js'
import { EmbeddingCache } from './cache.js'
import { embed, EMBEDDING_DIMENSIONS, MODEL_NAME } from './provider.js'

export interface EmbeddedTool {
  server: string
  displayName: string
  toolName: string
  description: string
  embedding: number[]
}

export interface BuildEmbeddingsOptions {
  logger?: Pick<Console, 'log'>
}

export async function buildEmbeddings(options: BuildEmbeddingsOptions = {}): Promise<EmbeddedTool[]> {
  const logger = options.logger
  const corpusPath = resolve(process.cwd(), 'src', 'data', 'corpus.json')
  const rawCorpus = await readFile(corpusPath, 'utf-8')
  const corpus = JSON.parse(rawCorpus) as Corpus
  const cache = new EmbeddingCache()
  const embeddedTools: EmbeddedTool[] = []
  const totalEmbeddableTools = countEmbeddableTools(corpus)
  let processed = 0
  let cacheHits = 0
  let generated = 0
  let skipped = 0

  logger?.log(`[embed] loaded corpus with ${corpus.server_count} servers and ${corpus.tool_count} tools`)
  logger?.log(`[embed] embedding ${totalEmbeddableTools} tools with model ${MODEL_NAME}`)

  try {
    for (const server of corpus.servers) {
      for (const tool of server.tools) {
        const description = tool.description.trim()
        if (description.length === 0) {
          skipped += 1
          continue
        }

        const hash = cache.hash(description)
        let embedding = cache.get(hash)

        if (embedding) {
          cacheHits += 1
        } else {
          embedding = await embed(description)
          cache.set(hash, embedding, MODEL_NAME)
          generated += 1
        }

        if (embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new Error(
            `Expected ${EMBEDDING_DIMENSIONS} values for ${server.displayName}/${tool.name}, received ${embedding.length}`,
          )
        }

        embeddedTools.push({
          server: server.qualifiedName,
          displayName: server.displayName,
          toolName: tool.name,
          description,
          embedding: Array.from(embedding),
        })

        processed += 1
        if (processed === 1 || processed % 50 === 0 || processed === totalEmbeddableTools) {
          logger?.log(
            `[embed] processed ${processed}/${totalEmbeddableTools} (cache hits: ${cacheHits}, generated: ${generated})`,
          )
        }
      }
    }
  } finally {
    cache.close()
  }

  logger?.log(
    `[embed] complete — embedded ${embeddedTools.length} tools, cache hits: ${cacheHits}, generated: ${generated}, skipped: ${skipped}`,
  )

  return embeddedTools
}

function countEmbeddableTools(corpus: Corpus): number {
  return corpus.servers.reduce((total, server) => {
    return total + server.tools.filter(tool => tool.description.trim().length > 0).length
  }, 0)
}

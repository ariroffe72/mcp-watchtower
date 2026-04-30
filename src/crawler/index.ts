import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fetchTopServers, fetchToolsForServer, sleep } from './smithery.js'

const DETAIL_REQUEST_DELAY_MS = 1500

export interface CorpusTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface CorpusServer {
  qualifiedName: string
  displayName: string
  description: string
  homepage: string
  useCount: number
  tools: CorpusTool[]
}

export interface CrawledCorpusServer extends CorpusServer {
  verified: boolean
}

export interface Corpus {
  generated_at: string
  server_count: number
  tool_count: number
  servers: CorpusServer[]
}

export interface CrawlerLogger {
  log: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

// Legacy exports kept for compatibility with existing source modules.
export interface NormalizedTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface NormalizedServer {
  name: string
  description: string
  registry_url: string
  source: 'smithery' | 'github'
  tools: NormalizedTool[]
}

export interface CrawlContext {
  fetchText: (url: string) => Promise<string>
  fetchJson: <T>(url: string) => Promise<T>
  logger: CrawlerLogger
}

export interface CrawlOptions {
  logger?: CrawlerLogger
  outputPath?: string
}

export interface CrawlCleanupResult {
  servers: CrawledCorpusServer[]
  removedCount: number
}

export interface PostCrawlCleanupResult {
  servers: CrawledCorpusServer[]
  removedByDisplayName: number
  removedByNamespace: number
}

export async function crawlAll(options: CrawlOptions = {}): Promise<Corpus> {
  const logger = options.logger ?? console

  logger.log('[crawl] fetching top 300 servers by useCount...')
  const topServers = await fetchTopServers({
    onPage: (page, totalPages) => logger.log(`[crawl] page ${page}/${totalPages}`),
    onWarning: message => logger.warn(message),
  })

  logger.log('[crawl] fetching tool definitions...')

  const servers: CrawledCorpusServer[] = []
  const seenQualifiedNames = new Set<string>()
  let skipped = 0

  for (let index = 0; index < topServers.length; index += 1) {
    const server = topServers[index]
    logger.log(`[crawl] ${index + 1}/${topServers.length} ${server.displayName} (useCount: ${server.useCount})`)

    if (seenQualifiedNames.has(server.qualifiedName)) {
      continue
    }
    seenQualifiedNames.add(server.qualifiedName)

    const tools = await fetchToolsForServer(server.qualifiedName)
    if (!tools || tools.length === 0) {
      skipped += 1
    } else {
      servers.push({
        qualifiedName: server.qualifiedName,
        displayName: server.displayName,
        description: server.description,
        homepage: server.homepage,
        useCount: server.useCount,
        verified: server.verified,
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: isObject(tool.inputSchema) ? tool.inputSchema : {},
        })),
      })
    }

    if (index < topServers.length - 1) {
      await sleep(DETAIL_REQUEST_DELAY_MS)
    }
  }

  const cleanup = applyPostCrawlCleanup(servers)
  logger.log(`[crawl] removed ${cleanup.removedByDisplayName} servers by displayName dedupe`)
  logger.log(`[crawl] removed ${cleanup.removedByNamespace} servers from spam namespace clusters`)

  const corpus: Corpus = {
    generated_at: new Date().toISOString(),
    server_count: cleanup.servers.length,
    tool_count: cleanup.servers.reduce((total, server) => total + server.tools.length, 0),
    servers: cleanup.servers.map(({ verified: _verified, ...server }) => server),
  }

  const outputPath = options.outputPath ?? resolve(process.cwd(), 'src', 'data', 'corpus.json')
  await writeCorpus(corpus, outputPath)

  logger.log(`[crawl] done — ${corpus.server_count} servers with tools, ${skipped} skipped (no tools)`)
  logger.log('[crawl] corpus written to src/data/corpus.json')
  logger.log(`[crawl] servers: ${corpus.server_count}  tools: ${corpus.tool_count}`)

  return corpus
}

export async function writeCorpus(corpus: Corpus, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(corpus, null, 2) + '\n', 'utf-8')
}

export function applyPostCrawlCleanup(servers: CrawledCorpusServer[]): PostCrawlCleanupResult {
  const deduped = dedupeServersByDisplayName(servers)
  const filtered = removeSpamNamespaceClusters(deduped.servers)

  return {
    servers: filtered.servers,
    removedByDisplayName: deduped.removedCount,
    removedByNamespace: filtered.removedCount,
  }
}

export function dedupeServersByDisplayName(servers: CrawledCorpusServer[]): CrawlCleanupResult {
  const winnersByDisplayName = new Map<string, CrawledCorpusServer>()

  for (const server of servers) {
    const displayNameKey = normalizeDisplayName(server.displayName)
    const winner = winnersByDisplayName.get(displayNameKey)

    if (!winner || isBetterDisplayNameWinner(server, winner)) {
      winnersByDisplayName.set(displayNameKey, server)
    }
  }

  const winningServers = new Set(winnersByDisplayName.values())
  const dedupedServers = servers.filter(server => winningServers.has(server))

  return {
    servers: dedupedServers,
    removedCount: servers.length - dedupedServers.length,
  }
}

export function removeSpamNamespaceClusters(servers: CrawledCorpusServer[]): CrawlCleanupResult {
  const namespaces = new Map<string, CrawledCorpusServer[]>()

  for (const server of servers) {
    const namespace = extractNamespace(server.qualifiedName)
    const bucket = namespaces.get(namespace)
    if (bucket) {
      bucket.push(server)
    } else {
      namespaces.set(namespace, [server])
    }
  }

  const spamNamespaces = new Set<string>()

  for (const [namespace, namespaceServers] of namespaces.entries()) {
    const averageUseCount =
      namespaceServers.reduce((total, server) => total + server.useCount, 0) / namespaceServers.length

    if (namespaceServers.length >= 4 && averageUseCount < 500) {
      spamNamespaces.add(namespace)
    }
  }

  const filteredServers = servers.filter(server => !spamNamespaces.has(extractNamespace(server.qualifiedName)))

  return {
    servers: filteredServers,
    removedCount: servers.length - filteredServers.length,
  }
}

function normalizeDisplayName(displayName: string): string {
  return displayName.trim().toLowerCase()
}

function isBetterDisplayNameWinner(candidate: CrawledCorpusServer, current: CrawledCorpusServer): boolean {
  if (candidate.verified !== current.verified) {
    return candidate.verified
  }

  if (candidate.useCount !== current.useCount) {
    return candidate.useCount > current.useCount
  }

  return false
}

function extractNamespace(qualifiedName: string): string {
  const slashIndex = qualifiedName.indexOf('/')
  return slashIndex === -1 ? qualifiedName : qualifiedName.slice(0, slashIndex)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

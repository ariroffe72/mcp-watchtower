import type { CrawlContext, NormalizedServer, NormalizedTool } from '../index.js'

const SMITHERY_LIST_URL = 'https://registry.smithery.ai/servers'
const SMITHERY_SERVER_URL = 'https://registry.smithery.ai/servers/'

interface SmitheryListServer {
  qualifiedName?: string
  displayName?: string
  description?: string
}

interface SmitheryPagination {
  currentPage?: number
  totalPages?: number
}

interface SmitheryListResponse {
  servers?: SmitheryListServer[]
  pagination?: SmitheryPagination
}

interface SmitheryManifestResponse {
  qualifiedName?: string
  displayName?: string
  description?: string
  tools?: unknown
}

export async function crawlSmithery(context: CrawlContext): Promise<NormalizedServer[]> {
  const logger = context.logger
  const servers: NormalizedServer[] = []

  let firstPage: SmitheryListResponse
  try {
    firstPage = await context.fetchJson<SmitheryListResponse>(`${SMITHERY_LIST_URL}?page=1&pageSize=100`)
  } catch (error) {
    logger.error(`[smithery] failed to load server list: ${(error as Error).message}`)
    return []
  }

  const allServers: SmitheryListServer[] = [...(firstPage.servers ?? [])]
  const totalPages = Math.max(firstPage.pagination?.totalPages ?? 1, 1)

  for (let page = 2; page <= totalPages; page++) {
    try {
      const nextPage = await context.fetchJson<SmitheryListResponse>(
        `${SMITHERY_LIST_URL}?page=${page}&pageSize=100`
      )
      allServers.push(...(nextPage.servers ?? []))
    } catch (error) {
      logger.warn(`[smithery] failed to fetch page ${page}: ${(error as Error).message}`)
    }
  }

  logger.log(`[smithery] discovered ${allServers.length} candidate servers`)

  let processed = 0
  for (const candidate of allServers) {
    processed += 1

    const qualifiedName = firstString(candidate.qualifiedName)
    if (!qualifiedName) {
      continue
    }

    const manifestUrl = `${SMITHERY_SERVER_URL}${encodeURIComponent(qualifiedName)}`
    try {
      const manifest = await context.fetchJson<SmitheryManifestResponse>(manifestUrl)
      const tools = normalizeTools(manifest.tools)
      if (tools.length === 0) {
        continue
      }

      servers.push({
        name: firstString(manifest.qualifiedName, manifest.displayName, candidate.qualifiedName, candidate.displayName) ?? qualifiedName,
        description: firstString(manifest.description, candidate.description) ?? '',
        registry_url: manifestUrl,
        source: 'smithery',
        tools,
      })
    } catch (error) {
      context.logger.warn(`[smithery] skipped ${qualifiedName}: ${(error as Error).message}`)
    }

    if (processed % 100 === 0 || processed === allServers.length) {
      logger.log(`[smithery] processed ${processed}/${allServers.length} (indexed ${servers.length})`)
    }
  }

  return servers
}

function firstString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function normalizeTools(rawTools: unknown): NormalizedTool[] {
  const result: NormalizedTool[] = []
  const seen = new Set<string>()

  for (const tool of toToolArray(rawTools)) {
    const key = tool.name.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(tool)
  }

  return result
}

function toToolArray(rawTools: unknown): NormalizedTool[] {
  if (!Array.isArray(rawTools)) {
    return []
  }

  const tools: NormalizedTool[] = []
  for (const candidate of rawTools) {
    if (!isObject(candidate)) {
      continue
    }

    const name = toNonEmptyString(candidate.name)
    if (!name) {
      continue
    }

    tools.push({
      name,
      description: toNonEmptyString(candidate.description) ?? '',
      inputSchema: isObject(candidate.inputSchema) ? candidate.inputSchema : {},
    })
  }

  return tools
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

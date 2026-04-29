const SMITHERY_BASE_URL = 'https://api.smithery.ai'
const PAGE_SIZE = 100
const TOP_SERVER_COUNT = 300

export interface SmitheryServer {
  qualifiedName: string
  displayName: string
  description: string
  useCount: number
  homepage: string
  verified: boolean
}

export interface SmitheryTool {
  name: string
  description: string
  inputSchema?: object
}

interface SmitheryListResponse {
  servers?: Array<Partial<SmitheryServer>>
  pagination?: SmitheryPagination
}

interface SmitheryPagination {
  currentPage?: number
  totalPages?: number
}

interface SmitheryServerDetail {
  tools?: unknown
}

interface FetchTopServersOptions {
  onPage?: (page: number, totalPages: number) => void
  onWarning?: (message: string) => void
}

export async function fetchTopServers(options: FetchTopServersOptions = {}): Promise<SmitheryServer[]> {
  const serversByQualifiedName = new Map<string, SmitheryServer>()
  let page = 1
  let totalPages = Number.POSITIVE_INFINITY

  while (serversByQualifiedName.size < TOP_SERVER_COUNT && page <= totalPages) {
    options.onPage?.(page, Number.isFinite(totalPages) ? totalPages : page)

    try {
      const response = await fetch(`${SMITHERY_BASE_URL}/servers?pageSize=${PAGE_SIZE}&page=${page}`, {
        headers: authHeaders(),
      })

      if (!response.ok) {
        options.onWarning?.(`[crawl] failed to fetch page ${page}: HTTP ${response.status} ${response.statusText}`)
        continue
      }

      const payload = (await response.json()) as SmitheryListResponse
      const currentPage = Math.max(payload.pagination?.currentPage ?? page, page)
      totalPages = Math.max(payload.pagination?.totalPages ?? currentPage, currentPage)

      for (const server of payload.servers ?? []) {
        const qualifiedName = nonEmptyString(server.qualifiedName)
        if (!qualifiedName) {
          continue
        }

        const nextServer: SmitheryServer = {
          qualifiedName,
          displayName: nonEmptyString(server.displayName) ?? qualifiedName,
          description: nonEmptyString(server.description) ?? '',
          useCount: typeof server.useCount === 'number' ? server.useCount : 0,
          homepage: nonEmptyString(server.homepage) ?? '',
          verified: typeof server.verified === 'boolean' ? server.verified : false,
        }

        const existing = serversByQualifiedName.get(qualifiedName)
        if (!existing || nextServer.useCount > existing.useCount) {
          serversByQualifiedName.set(qualifiedName, nextServer)
        }
      }
    } catch (error) {
      options.onWarning?.(`[crawl] failed to fetch page ${page}: ${(error as Error).message}`)
    }

    page += 1
  }

  const allServers = [...serversByQualifiedName.values()]
  allServers.sort((a, b) => b.useCount - a.useCount)
  return allServers.slice(0, TOP_SERVER_COUNT)
}

export async function fetchToolsForServer(qualifiedName: string): Promise<SmitheryTool[] | null> {
  const endpoint = `${SMITHERY_BASE_URL}/servers/${encodeURIComponent(qualifiedName)}`

  try {
    const firstAttempt = await fetch(endpoint, { headers: authHeaders() })
    if (firstAttempt.status === 429) {
      await sleep(5000)
      const retryAttempt = await fetch(endpoint, { headers: authHeaders() })
      return extractToolsFromResponse(retryAttempt)
    }
    return extractToolsFromResponse(firstAttempt)
  } catch {
    return null
  }
}

function extractToolsFromResponse(response: Response): Promise<SmitheryTool[] | null> {
  if (!response.ok) {
    return Promise.resolve(null)
  }

  return response
    .json()
    .then((payload: SmitheryServerDetail) => {
      const tools = toTools(payload.tools)
      return tools.length > 0 ? tools : null
    })
    .catch(() => null)
}

function toTools(raw: unknown): SmitheryTool[] {
  if (!Array.isArray(raw)) {
    return []
  }

  const tools: SmitheryTool[] = []
  for (const candidate of raw) {
    if (!isObject(candidate)) {
      continue
    }

    const name = nonEmptyString(candidate.name)
    if (!name) {
      continue
    }

    tools.push({
      name,
      description: nonEmptyString(candidate.description) ?? '',
      inputSchema: isObject(candidate.inputSchema) ? candidate.inputSchema : {},
    })
  }

  return tools
}

function authHeaders(): Record<string, string> {
  const apiKey = process.env.SMITHERY_API_KEY
  if (!apiKey) {
    throw new Error('SMITHERY_API_KEY is required')
  }
  return {
    Authorization: `Bearer ${apiKey}`,
  }
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

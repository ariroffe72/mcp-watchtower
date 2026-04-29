import type { CrawlContext, NormalizedServer, NormalizedTool } from '../index.js'

const README_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md'
const RAW_BASE_URL = 'https://raw.githubusercontent.com'

interface GithubRepoRef {
  owner: string
  repo: string
  repoUrl: string
  subPath?: string
  label: string
}

interface RepoManifest {
  name?: string
  description?: string
  tools?: unknown
}

export async function crawlGithub(context: CrawlContext): Promise<NormalizedServer[]> {
  const logger = context.logger
  let readme: string

  try {
    readme = await context.fetchText(README_URL)
  } catch (error) {
    logger.error(`[github] failed to load MCP registry README: ${(error as Error).message}`)
    return []
  }

  const repos = extractGithubRepos(readme)
  logger.log(`[github] discovered ${repos.length} candidate GitHub repos`)

  const servers: NormalizedServer[] = []
  let processed = 0

  for (const repo of repos) {
    processed += 1

    try {
      const manifest = await fetchManifest(repo, context)
      if (!manifest) {
        continue
      }

      const tools = normalizeTools(manifest.tools)
      if (tools.length === 0) {
        continue
      }

      servers.push({
        name: firstString(manifest.name, repo.label, `${repo.owner}/${repo.repo}`) ?? `${repo.owner}/${repo.repo}`,
        description: firstString(manifest.description) ?? '',
        registry_url: repo.repoUrl,
        source: 'github',
        tools,
      })
    } catch (error) {
      logger.warn(`[github] skipped ${repo.repoUrl}: ${(error as Error).message}`)
    }

    if (processed % 25 === 0 || processed === repos.length) {
      logger.log(`[github] processed ${processed}/${repos.length} (indexed ${servers.length})`)
    }
  }

  return servers
}

async function fetchManifest(repo: GithubRepoRef, context: CrawlContext): Promise<RepoManifest | null> {
  const branches = ['main', 'master']
  const fileNames = ['mcp.json', 'package.json']
  const prefixes = repo.subPath ? [repo.subPath, ''] : ['']

  for (const branch of branches) {
    for (const prefix of prefixes) {
      for (const fileName of fileNames) {
        const relativePath = prefix ? `${prefix}/${fileName}` : fileName
        const url = `${RAW_BASE_URL}/${repo.owner}/${repo.repo}/${branch}/${relativePath}`

        try {
          const raw = await context.fetchJson<unknown>(url)
          const manifest = parseManifest(raw, fileName)
          if (manifest) {
            return manifest
          }
        } catch (error) {
          const message = (error as Error).message
          if (!message.startsWith('HTTP 404')) {
            context.logger.warn(`[github] failed ${url}: ${message}`)
          }
        }
      }
    }
  }

  return null
}

function parseManifest(raw: unknown, fileName: string): RepoManifest | null {
  if (!isObject(raw)) {
    return null
  }

  if (fileName === 'package.json') {
    if (!isObject(raw.mcp)) {
      return null
    }
    return {
      name: firstString(raw.mcp.name, raw.name),
      description: firstString(raw.mcp.description, raw.description),
      tools: raw.mcp.tools,
    }
  }

  if (Array.isArray(raw.tools) || isObject(raw.tools)) {
    return {
      name: firstString(raw.name),
      description: firstString(raw.description),
      tools: raw.tools,
    }
  }

  if (isObject(raw.mcp) && (Array.isArray(raw.mcp.tools) || isObject(raw.mcp.tools))) {
    return {
      name: firstString(raw.mcp.name, raw.name),
      description: firstString(raw.mcp.description, raw.description),
      tools: raw.mcp.tools,
    }
  }

  return null
}

function extractGithubRepos(markdown: string): GithubRepoRef[] {
  const refs: GithubRepoRef[] = []
  const byRepo = new Map<string, GithubRepoRef>()
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g

  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(markdown)) !== null) {
    const label = match[1].trim()
    const url = match[2].trim()

    const parsed = toRepoRef(label, url)
    if (!parsed) {
      continue
    }

    const key = `${parsed.owner}/${parsed.repo}`
    if (!byRepo.has(key)) {
      byRepo.set(key, parsed)
      refs.push(parsed)
    }
  }

  return refs
}

function toRepoRef(label: string, url: string): GithubRepoRef | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.hostname !== 'github.com') {
    return null
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    return null
  }

  const owner = segments[0]
  const repo = segments[1]
  if (!owner || !repo || repo === 'features' || repo === 'topics') {
    return null
  }

  let subPath: string | undefined
  if ((segments[2] === 'tree' || segments[2] === 'blob') && segments.length > 4) {
    subPath = segments.slice(4).join('/')
  }

  return {
    owner,
    repo,
    repoUrl: `https://github.com/${owner}/${repo}`,
    subPath,
    label,
  }
}

function normalizeTools(rawTools: unknown): NormalizedTool[] {
  const result: NormalizedTool[] = []
  const seen = new Set<string>()

  for (const tool of toToolArray(rawTools)) {
    const dedupeKey = tool.name.toLowerCase()
    if (seen.has(dedupeKey)) {
      continue
    }
    seen.add(dedupeKey)
    result.push(tool)
  }

  return result
}

function toToolArray(rawTools: unknown): NormalizedTool[] {
  if (Array.isArray(rawTools)) {
    return rawTools
      .map(candidate => toTool(candidate))
      .filter((tool): tool is NormalizedTool => tool !== null)
  }

  if (isObject(rawTools)) {
    const tools: NormalizedTool[] = []
    for (const [name, value] of Object.entries(rawTools)) {
      if (!isObject(value)) {
        continue
      }

      const normalizedName = firstString(value.name, name)
      if (!normalizedName) {
        continue
      }

      tools.push({
        name: normalizedName,
        description: firstString(value.description) ?? '',
        inputSchema: isObject(value.inputSchema) ? value.inputSchema : {},
      })
    }
    return tools
  }

  return []
}

function toTool(raw: unknown): NormalizedTool | null {
  if (!isObject(raw)) {
    return null
  }

  const name = firstString(raw.name)
  if (!name) {
    return null
  }

  return {
    name,
    description: firstString(raw.description) ?? '',
    inputSchema: isObject(raw.inputSchema) ? raw.inputSchema : {},
  }
}

function firstString(...values: Array<unknown>): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return undefined
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

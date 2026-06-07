import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScanReport } from '../src/index.js'

interface DashboardCommandOptions {
  input: string
  host: string
  port: number
}

interface StartDashboardServerOptions extends DashboardCommandOptions {
  dashboardRoot?: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

export async function runDashboardCommand(options: DashboardCommandOptions): Promise<void> {
  const { server, url, report } = await startDashboardServer(options)
  const close = () => {
    server.close(() => process.exit(0))
  }

  process.stdout.write(
    `Dashboard ready at ${url}\n` +
    `Loaded ${report.toolCount} tools for ${report.server} from ${options.input}\n` +
    'Press Ctrl+C to stop the server.\n',
  )

  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}

export async function startDashboardServer(options: StartDashboardServerOptions): Promise<{
  report: ScanReport
  server: Server
  url: string
}> {
  const report = await loadScanReport(options.input)
  const dashboardRoot = options.dashboardRoot ?? defaultDashboardRoot()

  await ensureDashboardRoot(dashboardRoot)

  const server = createServer((request, response) => {
    handleDashboardRequest(request, response, dashboardRoot, report).catch(() => {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('Internal server error')
    })
  })

  await listen(server, options.port, options.host)

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Dashboard server started without a usable address.')
  }

  const displayHost = options.host === '0.0.0.0' ? '127.0.0.1' : address.address
  const urlHost = displayHost.includes(':') ? `[${displayHost}]` : displayHost
  return {
    report,
    server,
    url: `http://${urlHost}:${address.port}`,
  }
}

export async function closeDashboardServer(server: Server): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }

      resolvePromise()
    })
  })
}

export async function loadScanReport(inputPath: string): Promise<ScanReport> {
  const raw = await readFile(resolve(inputPath), 'utf-8')

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Could not parse dashboard input "${inputPath}" as JSON.`)
  }

  if (!isScanReport(parsed)) {
    throw new Error(`Dashboard input "${inputPath}" is not a valid scan report.`)
  }

  return parsed
}

async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dashboardRoot: string,
  report: ScanReport,
): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Method not allowed')
    return
  }

  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/report') {
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.json'] })
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify(report))
    return
  }

  const requestedPath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
  let filePath: string
  try {
    filePath = resolveStaticPath(dashboardRoot, requestedPath)
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const asset = await tryReadFile(filePath)

  if (asset !== undefined) {
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    })
    response.end(request.method === 'HEAD' ? undefined : asset)
    return
  }

  const fallbackPath = resolve(dashboardRoot, 'index.html')
  const fallback = await tryReadFile(fallbackPath)

  if (fallback !== undefined && !extname(requestedPath)) {
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES['.html'] })
    response.end(request.method === 'HEAD' ? undefined : fallback)
    return
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  response.end('Not found')
}

function defaultDashboardRoot(): string {
  const currentDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
  return resolve(currentDir, '..', 'dashboard')
}

async function ensureDashboardRoot(dashboardRoot: string): Promise<void> {
  const indexPath = resolve(dashboardRoot, 'index.html')
  const indexFile = await tryReadFile(indexPath)
  if (indexFile === undefined) {
    throw new Error(`Dashboard assets were not found at "${dashboardRoot}". Run npm run build first.`)
  }
}

function resolveStaticPath(rootPath: string, requestPath: string): string {
  const normalizedPath = requestPath.replace(/^[/\\]+/, '')
  const resolvedPath = resolve(rootPath, normalizedPath)
  const relativePath = relative(rootPath, resolvedPath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Refused to serve a path outside the dashboard directory.')
  }

  return resolvedPath
}

async function tryReadFile(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }

    throw error
  }
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolvePromise()
    })
  })
}

function isScanReport(value: unknown): value is ScanReport {
  if (!value || typeof value !== 'object') {
    return false
  }

  const report = value as Record<string, unknown>
  const analysis = report.analysis as Record<string, unknown> | undefined

  return (
    typeof report.server === 'string' &&
    typeof report.toolCount === 'number' &&
    typeof report.passedAt === 'string' &&
    typeof report.reportVersion === 'number' &&
    Array.isArray(report.tools) &&
    Array.isArray(report.findings) &&
    Array.isArray(report.semanticFindings) &&
    !!analysis &&
    typeof analysis === 'object' &&
    typeof analysis.static === 'object' &&
    typeof analysis.semantic === 'object'
  )
}

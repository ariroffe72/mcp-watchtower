#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander'
import { readFileSync } from 'fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { refreshIndexIfNeeded } from '../src/index-updater/index.js'
import { SemanticAnalyzer, StaticAnalyzer } from '../src/index.js'
import type { ToolSchema } from '../src/index.js'
import chalk from 'chalk'
import {
  deriveServerNameFromCommand,
  deriveServerNameFromManifest,
  deriveServerNameFromUrl,
  resolveInputMode,
  type ScanInputOptions,
} from './input.js'
import { resolveAnalysisMode } from './analysis.js'
import { createProgressReporter, printHuman } from './output.js'

const program = new Command()

function printBanner(options: { json?: boolean }) {
  if (options.json) return
  console.log(chalk.green(`
  ╔══════════════════════════╗
  ║   ⊕  MCP-WATCHTOWER  ⊕  ║
  ║  shadow · params · names ║
  ╚══════════════════════════╝
`))
}

program
  .name('mcp-watchtower')
  .description('Static analysis and compatibility checks for MCP servers')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan an MCP server for tool conflicts and compatibility issues')
  .option('-s, --server <command>', 'command to start the MCP server process')
  .option('-r, --remote <url>',      'remote MCP endpoint URL (e.g. https://api.example.com/mcp)')
  .option('-t, --auth-token <token>', 'optional bearer token for a protected --remote MCP endpoint')
  .option('-m, --manifest <path>',  'path to a JSON file containing tools (CI fallback)')
  .option('-n, --name <name>',      'server name for the report')
  .option('-j, --json',             'output results as JSON')
  .option('-p, --platform',         'platform mode: elevates name collision severity to critical')
  .option('--max-tools <number>',   'maximum tools before warning (default: 20)', '20')
  .option('--syntactic',            'run only deterministic syntactic/static checks')
  .option('--semantic',             'run only semantic overlap detection plus deep semantic parameter analysis')
  .option('-v, --verbose',          'reserved for future expanded scan logging')
  .option('--threshold <number>',   'similarity threshold 0-1 (default: 0.75, used when semantic analysis runs)', parseThreshold)
  .action(async (options: ScanOptions) => {
    try {
      try {
        await refreshIndexIfNeeded()
      } catch {
        // Silent by design: index refresh must never block scanning.
      }
      printBanner(options)
      const { tools, serverName } = await resolveTools(options)
      const { runStatic, runSemantic } = resolveAnalysisMode(options)
      const reporter = createProgressReporter(options)
      const staticAnalyzer = new StaticAnalyzer({
        platform: !!options.platform,
        maxTools: parseInt(options.maxTools, 10),
        reporter,
      })
      const staticReport = runStatic
        ? staticAnalyzer.analyze(serverName, tools)
        : {
            server: serverName,
            toolCount: tools.length,
            findings: [],
            passedAt: new Date().toISOString(),
          }
      const semanticFindings = runSemantic
        ? (await new SemanticAnalyzer({
            threshold: options.threshold,
            reporter,
          }).analyze(serverName, tools)).findings
        : []
      const hasCritical = staticReport.findings.some(f => f.severity === 'critical')

      if (options.json) {
        process.stdout.write(JSON.stringify({
          ...staticReport,
          semanticFindings,
        }, null, 2) + '\n')
      } else {
        printHuman(staticReport.server, staticReport.toolCount, staticReport.findings, semanticFindings, {
          verbose: options.verbose,
        })
      }
      process.exit(hasCritical ? 1 : 0)
    } catch (err) {
      process.stderr.write(`\nError: ${(err as Error).message}\n\n`)
      process.exit(1)
    }
  })

program.parse()

async function resolveTools(options: {
  server?: string
  remote?: string
  authToken?: string
  manifest?: string
  name?: string
}): Promise<{ tools: ToolSchema[]; serverName: string }> {
  const mode = resolveInputMode(options, !!process.stdin.isTTY)

  if (mode === 'server') {
    const command = options.server!
    const tools = await fetchToolsFromLocalServer(command)
    const serverName = options.name ?? deriveServerNameFromCommand(command)
    return { tools, serverName }
  }

  if (mode === 'remote') {
    const endpoint = options.remote!
    const tools = await fetchToolsFromRemoteServer(endpoint, options.authToken)
    const serverName = options.name ?? deriveServerNameFromUrl(endpoint)
    return { tools, serverName }
  }

  if (mode === 'manifest') {
    const tools = parseToolsJson(readFileSync(options.manifest!, 'utf-8'))
    const serverName = options.name ?? deriveServerNameFromManifest(options.manifest!)
    return { tools, serverName }
  }

  const raw = await readStdin()
  const tools = parseToolsJson(raw)
  const serverName = options.name ?? 'unknown-server'
  return { tools, serverName }
}

interface ScanOptions extends ScanInputOptions {
  name?: string
  json?: boolean
  platform?: boolean
  syntactic?: boolean
  semantic?: boolean
  verbose?: boolean
  threshold?: number
  maxTools: string
}

async function fetchToolsFromLocalServer(command: string): Promise<ToolSchema[]> {
  const parts = command.trim().split(/\s+/)
  const cmd = parts[0]
  const args = parts.slice(1)

  process.stderr.write(`Connecting to server: ${command}\n`)

  const transport = new StdioClientTransport({
    command: cmd,
    args,
  })

  const client = new Client(
    { name: 'mcp-watchtower', version: '0.1.0' },
    { capabilities: {} }
  )

  try {
    await client.connect(transport)
    const response = await client.listTools()
    await closeClient(client)
    process.stderr.write(`Found ${response.tools.length} tools\n\n`)
    return response.tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as ToolSchema['inputSchema'],
    }))
  } catch (err) {
    await closeClient(client)
    throw new Error(
      `Failed to connect to server "${command}".\n` +
      `Make sure the command starts a valid MCP server.\n` +
      `Details: ${(err as Error).message}`
    )
  }
}

async function fetchToolsFromRemoteServer(endpoint: string, token?: string): Promise<ToolSchema[]> {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error(`Invalid remote URL "${endpoint}". Expected a full URL like https://api.example.com/mcp`)
  }

  process.stderr.write(`Connecting to remote server: ${url.toString()}\n`)

  const transport = new StreamableHTTPClientTransport(url, token
    ? {
        requestInit: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    : undefined)

  const client = new Client(
    { name: 'mcp-watchtower', version: '0.1.0' },
    { capabilities: {} }
  )

  try {
    await client.connect(transport)
    const response = await client.listTools()
    await closeClient(client)
    process.stderr.write(`Found ${response.tools.length} tools\n\n`)
    return response.tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as ToolSchema['inputSchema'],
    }))
  } catch (err) {
    await closeClient(client)
    throw new Error(
      `Failed to connect to remote MCP endpoint "${endpoint}".\n` +
      `Make sure the endpoint is reachable and any supplied bearer token is valid.\n` +
      `Details: ${(err as Error).message}`
    )
  }
}

async function closeClient(client: Client): Promise<void> {
  try {
    await client.close()
  } catch (err) {
    process.stderr.write(`Warning: failed to close MCP client: ${(err as Error).message}\n`)
  }
}

function parseToolsJson(raw: string): ToolSchema[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Could not parse input as JSON.')
  }
  // Accept raw array OR { tools: [...] } OR { result: { tools: [...] } }
  const tools = Array.isArray(parsed)
    ? parsed
    : (parsed as any)?.tools ?? (parsed as any)?.result?.tools
  if (!Array.isArray(tools)) {
    throw new Error(
      'JSON must be an array of tools or an object with a "tools" array.\n' +
      'Expected: [{ "name": "...", "description": "..." }, ...]'
    )
  }
  return tools as ToolSchema[]
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

function parseThreshold(value: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new InvalidArgumentError('Threshold must be a number between 0 and 1.')
  }

  return parsed
}

#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StaticAnalyzer } from '../src/index.js'
import type { ToolSchema, Finding } from '../src/index.js'

const program = new Command()

program
  .name('mcp-lens')
  .description('Static analysis and compatibility checks for MCP servers')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan an MCP server for tool conflicts and compatibility issues')
  .option('-s, --server <command>', 'command to start the MCP server process')
  .option('-m, --manifest <path>',  'path to a JSON file containing tools (CI fallback)')
  .option('-n, --name <name>',      'server name for the report')
  .option('-j, --json',             'output results as JSON')
  .option('-p, --platform',         'platform mode: elevates name collision severity to critical')
  .option('--max-tools <number>',   'maximum tools before warning (default: 20)', '20')
  .action(async (options) => {
    try {
      const { tools, serverName } = await resolveTools(options)
      const analyzer = new StaticAnalyzer({
        platform: !!options.platform,
        maxTools: parseInt(options.maxTools, 10),
      })
      const report = analyzer.analyze(serverName, tools)
      const hasCritical = report.findings.some(f => f.severity === 'critical')
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
      } else {
        printHuman(report.server, report.toolCount, report.findings)
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
  manifest?: string
  name?: string
}): Promise<{ tools: ToolSchema[]; serverName: string }> {
  // Mode 1: live server process
  if (options.server) {
    const tools = await fetchToolsFromServer(options.server)
    const serverName = options.name ?? deriveServerName(options.server)
    return { tools, serverName }
  }
  // Mode 2: manifest file
  if (options.manifest) {
    const tools = parseToolsJson(readFileSync(options.manifest, 'utf-8'))
    const serverName = options.name ?? 'unknown-server'
    return { tools, serverName }
  }
  // Mode 3: stdin
  if (!process.stdin.isTTY) {
    const raw = await readStdin()
    const tools = parseToolsJson(raw)
    const serverName = options.name ?? 'unknown-server'
    return { tools, serverName }
  }
  throw new Error(
    'No input provided. Examples:\n\n' +
    '  npx mcp-lens scan --server "python my_server.py"\n' +
    '  npx mcp-lens scan --server "node dist/server.js"\n' +
    '  npx mcp-lens scan --manifest ./tools.json\n'
  )
}

function deriveServerName(command: string): string {
  // "python my_server.py" → "my_server"
  // "node dist/server.js" → "server"
  // "uvx my-published-server" → "my-published-server"
  const parts = command.trim().split(/\s+/)
  const last = parts[parts.length - 1]
  return last.replace(/\.[^.]+$/, '').split('/').pop() ?? 'unknown-server'
}

async function fetchToolsFromServer(command: string): Promise<ToolSchema[]> {
  const parts = command.trim().split(/\s+/)
  const cmd = parts[0]
  const args = parts.slice(1)

  process.stderr.write(`Connecting to server: ${command}\n`)

  const transport = new StdioClientTransport({
    command: cmd,
    args,
  })

  const client = new Client(
    { name: 'mcp-lens', version: '0.1.0' },
    { capabilities: {} }
  )

  try {
    await client.connect(transport)
    const response = await client.listTools()
    await client.close()
    process.stderr.write(`Found ${response.tools.length} tools\n\n`)
    return response.tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema as ToolSchema['inputSchema'],
    }))
  } catch (err) {
    try { await client.close() } catch {}
    throw new Error(
      `Failed to connect to server "${command}".\n` +
      `Make sure the command starts a valid MCP server.\n` +
      `Details: ${(err as Error).message}`
    )
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

const SEVERITY_ICON: Record<string, string> = {
  critical: '✖',
  warning:  '⚠',
  info:     'ℹ',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICAL',
  warning:  'WARNING',
  info:     'INFO',
}

function printHuman(server: string, toolCount: number, findings: Finding[]): void {
  const criticals = findings.filter(f => f.severity === 'critical')
  const warnings  = findings.filter(f => f.severity === 'warning')
  const infos     = findings.filter(f => f.severity === 'info')

  process.stdout.write('\n')
  process.stdout.write(`mcp-lens — ${server}\n`)
  process.stdout.write(`${toolCount} tool${toolCount === 1 ? '' : 's'} scanned\n`)
  process.stdout.write('\n')

  if (findings.length === 0) {
    process.stdout.write('✔  No issues found\n\n')
    return
  }

  for (const finding of findings) {
    const icon  = SEVERITY_ICON[finding.severity]
    const label = SEVERITY_LABEL[finding.severity]
    const tool  = finding.tool ? ` [${finding.tool}]` : ''
    process.stdout.write(`${icon} ${label}${tool}  ${finding.code}\n`)
    process.stdout.write(`  ${finding.message}\n`)
    if (finding.relatedTool) {
      process.stdout.write(`  Related tool: ${finding.relatedTool}\n`)
    }
    process.stdout.write('\n')
  }

  process.stdout.write('─────────────────────────────────────\n')
  process.stdout.write(`${criticals.length} critical  ${warnings.length} warning  ${infos.length} info\n\n`)
}

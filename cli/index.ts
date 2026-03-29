#!/usr/bin/env node
import { Command } from 'commander'
import { readFileSync } from 'fs'
import { StaticAnalyzer } from '../src/index.js'
import type { ToolSchema, Finding } from '../src/index.js'

const program = new Command()

program
  .name('mcp-lens')
  .description('Static analysis and compatibility checks for MCP servers')
  .version('0.1.0')

program
  .command('scan')
  .description('Scan an MCP server\'s tools for issues')
  .option('-m, --manifest <path>', 'path to a JSON file containing the tools array')
  .option('-s, --server <name>', 'server name for the report', 'unknown-server')
  .option('-j, --json', 'output results as JSON')
  .option('-p, --platform', 'platform mode: elevates name collision severity to critical')
  .option('--max-tools <number>', 'maximum tools before warning (default: 20)', '20')
  .action(async (options) => {
    try {
      const tools = await loadTools(options.manifest)
      const analyzer = new StaticAnalyzer({
        platform: !!options.platform,
        maxTools: parseInt(options.maxTools, 10),
      })
      const report = analyzer.analyze(options.server, tools)
      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
        process.exit(report.findings.some(f => f.severity === 'critical') ? 1 : 0)
      } else {
        printHuman(report.server, report.toolCount, report.findings)
        process.exit(report.findings.some(f => f.severity === 'critical') ? 1 : 0)
      }
    } catch (err) {
      process.stderr.write(`Error: ${(err as Error).message}\n`)
      process.exit(1)
    }
  })

program.parse()

async function loadTools(manifestPath?: string): Promise<ToolSchema[]> {
  let raw: string
  if (manifestPath) {
    raw = readFileSync(manifestPath, 'utf-8')
  } else if (!process.stdin.isTTY) {
    raw = await readStdin()
  } else {
    throw new Error(
      'No input provided. Use --manifest <path> or pipe JSON via stdin.\n\n' +
      'Examples:\n' +
      '  npx mcp-lens scan --manifest ./tools.json --server my-server\n' +
      '  cat tools.json | npx mcp-lens scan --server my-server'
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Could not parse input as JSON. Make sure the file contains valid JSON.')
  }

  // Accept either a raw array or an object with a tools property.
  // This handles both { "tools": [...] } (MCP tools/list response shape)
  // and [...] (plain array)
  const tools = Array.isArray(parsed)
    ? parsed
    : (parsed as any)?.tools ?? (parsed as any)?.result?.tools

  if (!Array.isArray(tools)) {
    throw new Error(
      'Input JSON must be an array of tools or an object with a "tools" array.\n' +
      'Expected: [{ "name": "...", "description": "..." }, ...]\n' +
      'Got: ' + typeof parsed
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
    process.stdout.write('✔ No issues found\n\n')
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

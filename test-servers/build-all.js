#!/usr/bin/env node
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const SKIP_PYTHON = args.includes('--skip-python')
const SKIP_GO = args.includes('--skip-go')
const isWindows = process.platform === 'win32'

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function checkPrereq(cmd, name, installUrl) {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' })
  } catch {
    console.error(`\nERROR: ${name} is not installed.`)
    console.error(`Install from: ${installUrl}`)
    console.error(`Or skip with --skip-${name.toLowerCase()}\n`)
    process.exit(1)
  }
}

function header(text) {
  console.log(`\n${text}`)
  console.log('─'.repeat(40))
}

const TS_SERVERS = [
  'clean-mcp',
  'bad-names-mcp',
  'mixed-conventions-mcp',
  'kitchen-sink-mcp',
  'market-mcp',
]

const PYTHON_SERVERS = [
  'param-conflicts-mcp',
  'shadow-mcp',
  'too-many-tools-mcp',
]

console.log('\nBuilding mcp-watchtower test servers')
console.log('='.repeat(40))

// TypeScript servers
header('TypeScript servers:')
for (const server of TS_SERVERS) {
  const cwd = join(__dirname, server)
  process.stdout.write(`  Building ${server}...`)
  run('npm install --silent', cwd)
  run('npm run build --silent', cwd)
  console.log(' ✔')
}

// Python servers
header('Python servers:')
if (SKIP_PYTHON) {
  console.log('  Skipped (--skip-python)')
} else {
  checkPrereq('uv', 'python', 'https://docs.astral.sh/uv/')
  for (const server of PYTHON_SERVERS) {
    const cwd = join(__dirname, server)
    process.stdout.write(`  Syncing ${server}...`)
    run('uv sync --quiet', cwd)
    console.log(' ✔')
  }
}

// Go server
header('Go server:')
if (SKIP_GO) {
  console.log('  Skipped (--skip-go)')
} else {
  checkPrereq('go', 'go', 'https://go.dev/dl/')
  const cwd = join(__dirname, 'finance-mcp')
  process.stdout.write('  Building finance-mcp...')
  run('go mod tidy', cwd)
  const binary = isWindows ? 'finance-mcp.exe' : 'finance-mcp'
  run(`go build -o ${binary} .`, cwd)
  console.log(' ✔')
}

console.log('\n' + '='.repeat(40))
console.log('All servers built successfully.\n')

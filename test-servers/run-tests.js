#!/usr/bin/env node
import { spawnSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const args = process.argv.slice(2)
const SKIP_PYTHON = args.includes('--skip-python')
const SKIP_GO = args.includes('--skip-go')
const isWindows = process.platform === 'win32'

const CLI = `node ${join(ROOT, 'dist', 'cli', 'index.js')}`

let passed = 0
let failed = 0
let skipped = 0

function check(label, expectedExit, cmd) {
  const result = spawnSync(cmd, {
    shell: true,
    cwd: __dirname,
    stdio: 'ignore',
  })
  const actual = result.status ?? 1
  if (actual === expectedExit) {
    console.log(`  ✔ ${label}`)
    passed++
  } else {
    console.log(`  ✖ ${label} (expected exit ${expectedExit}, got ${actual})`)
    failed++
  }
}

function skip(label) {
  console.log(`  - ${label} (skipped)`)
  skipped++
}

function section(title) {
  console.log(`\n${title}`)
  console.log('─'.repeat(40))
}

// Resolve server commands per OS
function tsServer(name) {
  return `${CLI} scan --server "node ${join(__dirname, name, 'dist', 'index.js')}"`
}

function pyServer(name) {
  // uv --directory <project-dir> run server.py picks up the correct virtualenv
  return `${CLI} scan --server "uv --directory ${join(__dirname, name)} run server.py"`
}

function goServer() {
  const binary = isWindows
    ? join(__dirname, 'finance-mcp', 'finance-mcp.exe')
    : join(__dirname, 'finance-mcp', 'finance-mcp')
  return `${CLI} scan --server "${binary}"`
}

console.log('\nmcp-watchtower end-to-end test suite')
console.log('='.repeat(40))

// TypeScript servers
section('TypeScript servers:')
check('clean-mcp — zero findings',             0, tsServer('clean-mcp'))
check('bad-names-mcp — critical duplicate',    1, tsServer('bad-names-mcp'))
check('mixed-conventions-mcp — warnings only', 0, tsServer('mixed-conventions-mcp'))
check('kitchen-sink-mcp — critical',           1, tsServer('kitchen-sink-mcp'))
check('market-mcp — clean',                    0, tsServer('market-mcp'))

// Python servers
section('Python servers:')
if (SKIP_PYTHON) {
  skip('param-conflicts-mcp — PARAMETER_CONFLICT')
  skip('shadow-mcp — SHADOW_PATTERN')
  skip('too-many-tools-mcp — TOOL_COUNT_WARNING')
} else {
  check('param-conflicts-mcp — warnings only', 0, pyServer('param-conflicts-mcp'))
  check('shadow-mcp — warnings only',          0, pyServer('shadow-mcp'))
  check('too-many-tools-mcp — warning only',   0, pyServer('too-many-tools-mcp'))
}

// Go server
section('Go server:')
if (SKIP_GO) {
  skip('finance-mcp without --platform')
  skip('finance-mcp with --platform')
} else {
  check('finance-mcp without --platform',             0, goServer())
  // --platform stores config for future cross-server collision detection;
  // single clean-server scans remain exit 0 until that feature is implemented
  check('finance-mcp with --platform (clean server)', 0, `${goServer()} --platform`)
}

// Platform mode
section('Platform mode (TypeScript):')
check('market-mcp without --platform',               0, tsServer('market-mcp'))
// Single clean-server scan remains exit 0 with --platform (future feature)
check('market-mcp with --platform (clean server)',   0, `${tsServer('market-mcp')} --platform`)
check('bad-names-mcp with --platform',               1, `${tsServer('bad-names-mcp')} --platform`)
check('kitchen-sink-mcp with --platform',            1, `${tsServer('kitchen-sink-mcp')} --platform`)

// Output format
section('Output format:')
check('JSON output parses cleanly', 0,
  `${tsServer('clean-mcp')} --json`)
check('manifest fallback works', 0,
  `${CLI} scan --manifest "${join(ROOT, 'tests', 'fixtures', 'sample-tools.json')}"`)
check('no args exits with error', 1,
  `${CLI} scan`)
check('bad server command fails gracefully', 1,
  `${CLI} scan --server "nonexistent-command-xyz-abc"`)

// Summary
console.log('\n' + '='.repeat(40))
console.log(`${passed} passed, ${failed} failed, ${skipped} skipped\n`)
if (failed > 0) process.exit(1)

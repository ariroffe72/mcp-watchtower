import { execFileSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const requiredPaths = [
  'dist/cli/index.js',
  'dist/src/index.js',
  'dist/src/analyzers/semantic.js',
  'dist/src/embeddings/provider.js',
  'dist/src/index-updater/index.js',
  'src/data/semantic-meta.json',
  'src/data/semantic.hnsw',
]

const output = execFileSync(npmCommand, ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
})

const manifest = parsePackJson(output)
const includedPaths = new Set((manifest.files ?? []).map(file => file.path))
const missingPaths = requiredPaths.filter(path => !includedPaths.has(path))

if (missingPaths.length > 0) {
  throw new Error(`npm pack is missing required files:\n${missingPaths.map(path => `- ${path}`).join('\n')}`)
}

process.stdout.write(`Verified npm pack contents (${requiredPaths.length} required files present).\n`)

function parsePackJson(output) {
  const firstBracket = output.indexOf('[')
  if (firstBracket === -1) {
    throw new Error(`Could not find npm pack JSON output:\n${output}`)
  }

  const parsed = JSON.parse(output.slice(firstBracket))
  if (!Array.isArray(parsed) || parsed.length === 0 || typeof parsed[0] !== 'object' || parsed[0] === null) {
    throw new Error(`Unexpected npm pack JSON output:\n${output}`)
  }

  return parsed[0]
}

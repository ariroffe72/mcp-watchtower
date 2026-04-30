import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const REMOTE_MANIFEST_URL = 'https://pub-0eeb51ca45a14ebe89372cca3f4bea7f.r2.dev/manifest.json'
const MANIFEST_TIMEOUT_MS = 3000

export const LOCAL_INDEX_DIR = join(homedir(), '.mcp-watchtower', 'index')
export const LOCAL_MANIFEST_PATH = join(LOCAL_INDEX_DIR, 'manifest.json')

export interface IndexFileManifest {
  size: number
  sha256: string
}

export interface IndexManifest {
  version: string
  generatedAt: string
  files: {
    'semantic.hnsw': IndexFileManifest
    'semantic-meta.json': IndexFileManifest
  }
}

interface RefreshOptions {
  manifestUrl?: string
}

export function startIndexUpdateCheck(): void {
  const modulePath = fileURLToPath(import.meta.url)
  const child = spawn(process.execPath, [modulePath, '--background'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  child.unref()
}

export async function refreshIndexIfNeeded(options: RefreshOptions = {}): Promise<void> {
  const manifestUrl = options.manifestUrl ?? REMOTE_MANIFEST_URL
  const remoteManifest = await fetchManifest(manifestUrl)
  if (!remoteManifest) {
    return
  }

  const localManifest = await readLocalManifest()
  if (localManifest && localManifest.version >= remoteManifest.version) {
    return
  }

  process.stderr.write(`[mcp-watchtower] updating index (${remoteManifest.version})...\n`)

  const manifestBaseUrl = new URL(manifestUrl)
  const downloadedFiles = await Promise.all([
    downloadManifestFile(new URL('semantic.hnsw', manifestBaseUrl), 'semantic.hnsw', remoteManifest.files['semantic.hnsw']),
    downloadManifestFile(
      new URL('semantic-meta.json', manifestBaseUrl),
      'semantic-meta.json',
      remoteManifest.files['semantic-meta.json'],
    ),
  ])

  try {
    await mkdir(LOCAL_INDEX_DIR, { recursive: true })

    for (const file of downloadedFiles) {
      await rename(file.tempPath, file.finalPath)
    }

    await writeFile(LOCAL_MANIFEST_PATH, JSON.stringify(remoteManifest, null, 2) + '\n', 'utf-8')
    process.stderr.write('[mcp-watchtower] index updated\n')
  } catch (error) {
    await Promise.all(downloadedFiles.map(file => rm(file.tempPath, { force: true })))
    throw error
  }
}

async function fetchManifest(manifestUrl: string): Promise<IndexManifest | null> {
  try {
    const response = await fetchWithTimeout(manifestUrl, MANIFEST_TIMEOUT_MS)
    if (!response.ok) {
      return null
    }

    return await response.json() as IndexManifest
  } catch {
    return null
  }
}

async function readLocalManifest(): Promise<IndexManifest | null> {
  if (!existsSync(LOCAL_MANIFEST_PATH)) {
    return null
  }

  try {
    const raw = await readFile(LOCAL_MANIFEST_PATH, 'utf-8')
    return JSON.parse(raw) as IndexManifest
  } catch {
    return null
  }
}

async function downloadManifestFile(url: URL, filename: string, manifest: IndexFileManifest): Promise<{
  tempPath: string
  finalPath: string
}> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`)
  }

  const body = Buffer.from(await response.arrayBuffer())
  if (body.byteLength !== manifest.size) {
    throw new Error(`Downloaded ${filename} size mismatch: expected ${manifest.size}, received ${body.byteLength}`)
  }

  const actualHash = sha256Hex(body)
  if (actualHash !== manifest.sha256) {
    throw new Error(`Downloaded ${filename} hash mismatch`)
  }

  const tempPath = join(LOCAL_INDEX_DIR, `${filename}.tmp-${process.pid}`)
  const finalPath = join(LOCAL_INDEX_DIR, filename)
  await mkdir(LOCAL_INDEX_DIR, { recursive: true })
  await writeFile(tempPath, body)

  return { tempPath, finalPath }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function sha256Hex(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--background')) {
  refreshIndexIfNeeded().catch(() => {
    // Background refresh must never block or surface errors to the main CLI flow.
  })
}

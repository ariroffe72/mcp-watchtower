import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const repoRoot = process.cwd()
const obsoleteMirrors = ['analyzers', 'crawler', 'embeddings', 'index-builder']

async function main() {
  await copyAnalyzerAssets()
  await removeObsoleteMirrors()
}

async function copyAnalyzerAssets() {
  const sourcePath = resolve(repoRoot, 'src', 'analyzers', 'shadow-patterns.json')
  const targetPath = resolve(repoRoot, 'dist', 'src', 'analyzers', 'shadow-patterns.json')

  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(sourcePath, targetPath)
}

async function removeObsoleteMirrors() {
  for (const dir of obsoleteMirrors) {
    await removeWithRetry(resolve(repoRoot, 'dist', dir))
  }
}

async function removeWithRetry(targetPath, attempts = 10) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === attempts) {
        throw error
      }

      await delay(attempt * 100)
    }
  }
}

function delay(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[build] postbuild failed: ${message}`)
  process.exitCode = 1
})

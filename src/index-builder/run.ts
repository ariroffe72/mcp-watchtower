import { buildIndex } from './index.js'

async function main(): Promise<void> {
  console.log('[index] starting semantic index build...')
  const result = await buildIndex({ logger: console })
  console.log(`[index] complete — indexed ${result.count} embeddings`)
}

main().catch(error => {
  console.error(`[index] fatal error: ${(error as Error).message}`)
  process.exitCode = 1
})

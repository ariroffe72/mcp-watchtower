import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildEmbeddings } from './index.js'

async function main(): Promise<void> {
  const outputPath = resolve(process.cwd(), 'src', 'data', 'embeddings.json')

  console.log('[embed] starting embedding build...')
  const embeddings = await buildEmbeddings({ logger: console })

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(embeddings, null, 2) + '\n', 'utf-8')

  console.log(`[embed] wrote ${embeddings.length} embedded tools to src/data/embeddings.json`)
}

main().catch(error => {
  console.error(`[embed] fatal error: ${(error as Error).message}`)
  process.exitCode = 1
})

import { crawlAll } from './index.js'

async function main(): Promise<void> {
  await crawlAll({ logger: console })
}

main().catch(error => {
  console.error(`[crawl] fatal error: ${(error as Error).message}`)
  process.exitCode = 1
})

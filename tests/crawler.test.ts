import { describe, expect, it } from 'vitest'
import {
  applyPostCrawlCleanup,
  dedupeServersByDisplayName,
  removeSpamNamespaceClusters,
  type CrawledCorpusServer,
} from '../src/crawler/index.js'

function makeServer(overrides: Partial<CrawledCorpusServer> = {}): CrawledCorpusServer {
  return {
    qualifiedName: 'alpha/default',
    displayName: 'Default Server',
    description: '',
    homepage: '',
    useCount: 0,
    verified: false,
    tools: [],
    ...overrides,
  }
}

describe('crawler cleanup helpers', () => {
  it('deduplicates display names with trim and case-insensitive matching, preferring verified servers', () => {
    const result = dedupeServersByDisplayName([
      makeServer({ qualifiedName: 'alpha/one', displayName: '  Shared Name  ', useCount: 900, verified: false }),
      makeServer({ qualifiedName: 'beta/two', displayName: 'shared name', useCount: 10, verified: true }),
      makeServer({ qualifiedName: 'gamma/three', displayName: 'Unique Name', useCount: 5 }),
    ])

    expect(result.removedCount).toBe(1)
    expect(result.servers.map(server => server.qualifiedName)).toEqual(['beta/two', 'gamma/three'])
  })

  it('uses higher useCount when verification status is tied', () => {
    const result = dedupeServersByDisplayName([
      makeServer({ qualifiedName: 'alpha/one', displayName: 'Shared Name', useCount: 50, verified: false }),
      makeServer({ qualifiedName: 'beta/two', displayName: 'shared name', useCount: 75, verified: false }),
    ])

    expect(result.removedCount).toBe(1)
    expect(result.servers.map(server => server.qualifiedName)).toEqual(['beta/two'])
  })

  it('removes spam namespace clusters, including slashless qualified names treated as their own namespace', () => {
    const result = removeSpamNamespaceClusters([
      makeServer({ qualifiedName: 'spam/one', displayName: 'Spam 1', useCount: 100 }),
      makeServer({ qualifiedName: 'spam/two', displayName: 'Spam 2', useCount: 200 }),
      makeServer({ qualifiedName: 'spam/three', displayName: 'Spam 3', useCount: 300 }),
      makeServer({ qualifiedName: 'spam/four', displayName: 'Spam 4', useCount: 400 }),
      makeServer({ qualifiedName: 'solo-server', displayName: 'Solo', useCount: 5 }),
      makeServer({ qualifiedName: 'healthy/one', displayName: 'Healthy 1', useCount: 500 }),
      makeServer({ qualifiedName: 'healthy/two', displayName: 'Healthy 2', useCount: 500 }),
      makeServer({ qualifiedName: 'healthy/three', displayName: 'Healthy 3', useCount: 500 }),
      makeServer({ qualifiedName: 'healthy/four', displayName: 'Healthy 4', useCount: 500 }),
    ])

    expect(result.removedCount).toBe(4)
    expect(result.servers.map(server => server.qualifiedName)).toEqual([
      'solo-server',
      'healthy/one',
      'healthy/two',
      'healthy/three',
      'healthy/four',
    ])
  })

  it('runs displayName dedupe before namespace spam filtering', () => {
    const result = applyPostCrawlCleanup([
      makeServer({ qualifiedName: 'spam/one', displayName: 'Shared Name', useCount: 100, verified: false }),
      makeServer({ qualifiedName: 'spam/two', displayName: 'shared name', useCount: 200, verified: true }),
      makeServer({ qualifiedName: 'spam/three', displayName: 'Spam 3', useCount: 300 }),
      makeServer({ qualifiedName: 'spam/four', displayName: 'Spam 4', useCount: 400 }),
    ])

    expect(result.removedByDisplayName).toBe(1)
    expect(result.removedByNamespace).toBe(0)
    expect(result.servers.map(server => server.qualifiedName)).toEqual(['spam/two', 'spam/three', 'spam/four'])
  })
})

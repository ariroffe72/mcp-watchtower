import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'mixed-conventions-mcp',
  version: '1.0.0',
})

server.tool('get_stock_price', 'Returns the current price for a stock.',  { ticker: z.string() }, async () => ({ content: [] }))
server.tool('getEarnings',     'Returns earnings data.',                   { ticker: z.string() }, async () => ({ content: [] }))
server.tool('search-news',     'Searches news articles.',                  { query: z.string()  }, async () => ({ content: [] }))
server.tool('fetch_dividends', 'Returns dividend history.',                { ticker: z.string() }, async () => ({ content: [] }))

const transport = new StdioServerTransport()
await server.connect(transport)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'param-conflicts-mcp',
  version: '1.0.0',
})

server.tool('get_stock_price', 'Returns the current price for a stock.',  { ticker: z.string() }, async () => ({ content: [] }))
server.tool('get_earnings',    'Returns earnings data for a company.',     { symbol: z.string() }, async () => ({ content: [] }))
server.tool('get_dividends',   'Returns dividend history for a stock.',   { stock: z.string()  }, async () => ({ content: [] }))

const transport = new StdioServerTransport()
await server.connect(transport)

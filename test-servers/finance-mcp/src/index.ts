import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'finance-mcp',
  version: '1.0.0',
})

// get_price intentionally shares a name with market-mcp (cross-server collision scenario)
server.tool('get_price',      'Returns the current market price for a financial instrument.', { ticker: z.string()  }, async () => ({ content: [] }))
server.tool('get_portfolio',  'Returns the current portfolio holdings and values.',           { user_id: z.string() }, async () => ({ content: [] }))
server.tool('get_risk_score', 'Returns a risk assessment score for a portfolio.',             { user_id: z.string() }, async () => ({ content: [] }))

const transport = new StdioServerTransport()
await server.connect(transport)

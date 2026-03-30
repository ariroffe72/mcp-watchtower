// Uses the low-level Server API so that duplicate tool names can be returned
// from tools/list — McpServer would throw at registration time before connecting.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  { name: 'bad-names-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'get_data', description: 'Returns market data.',       inputSchema: { type: 'object' as const, properties: { ticker: { type: 'string' } } } },
    { name: 'get_data', description: 'Also returns market data.',  inputSchema: { type: 'object' as const, properties: { ticker: { type: 'string' } } } },
    { name: 'get_news', description: 'Returns financial news.',    inputSchema: { type: 'object' as const, properties: { query:  { type: 'string' } } } },
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async () => ({
  content: []
}))

const transport = new StdioServerTransport()
await server.connect(transport)

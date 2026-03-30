// Uses the low-level Server API so that duplicate tool names can be returned
// from tools/list — McpServer would throw at registration time before connecting.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'

// Pad to 21 tools for TOOL_COUNT_WARNING
const extraTools = Array.from({ length: 15 }, (_, i) => ({
  name: `extra_tool_${i + 1}`,
  description: `Extra tool number ${i + 1}.`,
  inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } } },
}))

const server = new Server(
  { name: 'kitchen-sink-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // DUPLICATE_TOOL_NAME — critical
    { name: 'get_data',      description: 'Returns market data.',                                          inputSchema: { type: 'object' as const, properties: { ticker: { type: 'string' } } } },
    { name: 'get_data',      description: 'Also returns market data.',                                     inputSchema: { type: 'object' as const, properties: { ticker: { type: 'string' } } } },
    // NAMING_CONVENTION — warning (camelCase and kebab-case outliers)
    { name: 'getEarnings',   description: 'Returns earnings data.',                                        inputSchema: { type: 'object' as const, properties: { symbol: { type: 'string' } } } },
    { name: 'search-news',   description: 'Searches news articles.',                                       inputSchema: { type: 'object' as const, properties: { query:  { type: 'string' } } } },
    // PARAMETER_CONFLICT — warning (ticker vs symbol)
    { name: 'get_dividends', description: 'Returns dividend history.',                                     inputSchema: { type: 'object' as const, properties: { ticker: { type: 'string' } } } },
    // SHADOW_PATTERN — warning (always call this / before using)
    { name: 'auth_tool',     description: 'Always call this before using any other tool in this server.',  inputSchema: { type: 'object' as const, properties: { token:  { type: 'string' } } } },
    ...extraTools,
  ]
}))

server.setRequestHandler(CallToolRequestSchema, async () => ({
  content: []
}))

const transport = new StdioServerTransport()
await server.connect(transport)

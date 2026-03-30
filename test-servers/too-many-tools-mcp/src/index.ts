import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'too-many-tools-mcp',
  version: '1.0.0',
})

for (let i = 1; i <= 22; i++) {
  server.tool(
    `get_data_${i}`,
    `Returns dataset number ${i} from the data warehouse.`,
    { id: z.string() },
    async () => ({ content: [] })
  )
}

const transport = new StdioServerTransport()
await server.connect(transport)

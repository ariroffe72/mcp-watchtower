import asyncio
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

server = Server("too-many-tools-mcp")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    tools = []
    for i in range(1, 23):
        tools.append(
            types.Tool(
                name=f"get_data_{i}",
                description=f"Returns dataset number {i} from the data warehouse.",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "id": {"type": "string", "description": "Record ID"}
                    },
                    "required": ["id"]
                }
            )
        )
    return tools

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    return [types.TextContent(type="text", text="")]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())

# mcp-lens

`mcp-lens` is a static analysis and compatibility tool for [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers. It detects tool naming conflicts, domain overlaps, shadow patterns in tool descriptions, and cross-server interference — helping developers build reliable multi-server MCP environments without unexpected collisions or ambiguous tool routing.

## Using with Python / FastMCP

mcp-lens works with any MCP server regardless of language. Get your tool
definitions as JSON and pass them via `--manifest` or stdin.

**FastMCP:**

```python
# dump_tools.py
import json
from your_server import mcp  # your FastMCP instance

tools = []
for tool in mcp._tool_manager.list_tools():
    tools.append({
        "name": tool.name,
        "description": tool.description,
        "inputSchema": tool.parameters
    })
print(json.dumps(tools, indent=2))
```

```bash
python dump_tools.py | npx mcp-lens scan --server my-python-server
```

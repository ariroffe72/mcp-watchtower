from fastmcp import FastMCP

mcp = FastMCP("param-conflicts-mcp")

@mcp.tool()
def get_stock_price(ticker: str) -> str:
    """Returns the current price for a stock."""
    return ""

@mcp.tool()
def get_earnings(symbol: str) -> str:
    """Returns earnings data for a company."""
    return ""

@mcp.tool()
def get_dividends(stock: str) -> str:
    """Returns dividend history for a stock."""
    return ""

if __name__ == "__main__":
    mcp.run()

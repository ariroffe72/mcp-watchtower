package main

import (
	"fmt"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func main() {
	s := server.NewMCPServer("finance-mcp", "1.0.0")

	getPrice := mcp.NewTool("get_price",
		mcp.WithDescription("Returns the current market price for a financial instrument."),
		mcp.WithString("ticker",
			mcp.Required(),
			mcp.Description("Stock ticker symbol"),
		),
	)

	getPortfolio := mcp.NewTool("get_portfolio",
		mcp.WithDescription("Returns the current portfolio holdings and values."),
		mcp.WithString("user_id",
			mcp.Required(),
			mcp.Description("User identifier"),
		),
	)

	getRiskScore := mcp.NewTool("get_risk_score",
		mcp.WithDescription("Returns a risk assessment score for a portfolio."),
		mcp.WithString("user_id",
			mcp.Required(),
			mcp.Description("User identifier"),
		),
	)

	s.AddTool(getPrice, func(arguments map[string]interface{}) (*mcp.CallToolResult, error) {
		return mcp.NewToolResultText(""), nil
	})
	s.AddTool(getPortfolio, func(arguments map[string]interface{}) (*mcp.CallToolResult, error) {
		return mcp.NewToolResultText(""), nil
	})
	s.AddTool(getRiskScore, func(arguments map[string]interface{}) (*mcp.CallToolResult, error) {
		return mcp.NewToolResultText(""), nil
	})

	if err := server.ServeStdio(s); err != nil {
		fmt.Printf("Server error: %v\n", err)
	}
}

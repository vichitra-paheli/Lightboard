import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MCPContext } from './types';
import { createToolDefinitions } from './tools';

/**
 * Creates and configures the Lightboard MCP server.
 * Registers all Phase 1 tools with their handlers.
 * The server can be attached to a transport (SSE, stdio, etc.).
 */
export function createMCPServer(ctx: MCPContext): McpServer {
  const server = new McpServer({
    name: 'lightboard',
    version: '0.1.0',
  });

  const tools = createToolDefinitions(ctx);

  // Register each tool with the MCP SDK
  for (const [name, tool] of Object.entries(tools)) {
    server.tool(
      name,
      tool.description,
      tool.inputSchema.shape,
      async (input: Record<string, unknown>) => {
        const result = await tool.handler(input as never);
        return { ...result } as Record<string, unknown> & typeof result;
      },
    );
  }

  return server;
}

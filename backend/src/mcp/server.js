import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

export const MCP_SERVER_NAME = 'kinedu';
export const MCP_SERVER_VERSION = '1.0.0';

// One McpServer instance per client session (see router.js) — the SDK's
// own recommended pattern for the stateful Streamable HTTP transport.
export function createMcpServer() {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
  registerTools(server);
  return server;
}

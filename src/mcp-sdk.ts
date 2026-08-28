/**
 * Centralised re-export of the MCP TypeScript SDK surface this server uses.
 *
 * Every other module in the project imports MCP SDK symbols through this
 * file, never via deep imports of the SDK packages. If a future SDK release
 * moves symbols around, only this file needs to change.
 *
 * This is the public, stdio-only distribution: the HTTP/OAuth entry points
 * (`createMcpHandler`, `isLegacyRequest`, `AuthInfo`) that the internal
 * server re-exports here have no consumer and are deliberately absent.
 */

// High-level server with registerTool/registerPrompt — the only public-facing
// server surface. The low-level `Server` class is reachable as `mcpServer.server`
// for the handlers that still speak the raw request-schema API (prompts).
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Stdio transport (Claude Desktop / local clients) — the only transport.
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

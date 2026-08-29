#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpServer, StdioServerTransport } from './mcp-sdk.js';
import { loadConfig, getConfigStatus, clearSecureConfig } from './config.js';
import { setupEnhancedHandlers } from './handlers/enhanced-tools.js';
import { TOOL_SCHEMAS } from './handlers/tool-schemas.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';
import { setupSkillResources } from './skills/setup.js';
import { SKILL_RESOURCES } from './skills/loader.js';
import { setupPromptHandlers, PROMPT_NAMES } from './handlers/prompts.js';
import { ErrorHandlerService } from './services/error-handler-service.js';

// Initialize error handler for global error sanitization
const globalErrorHandler = new ErrorHandlerService();

// Global error handlers — always log to stderr so the host (Claude Desktop
// etc.) surfaces the cause in its extension log, not just a silent exit.
process.on('uncaughtException', (error: Error) => {
  console.error('[affise-mcp] Uncaught Exception:', globalErrorHandler.sanitizeErrorMessage(error.message));
  if (error.stack) {
    console.error('[affise-mcp] Stack:', globalErrorHandler.sanitizeErrorMessage(error.stack));
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[affise-mcp] Unhandled Rejection:', globalErrorHandler.sanitizeErrorMessage(String(reason)));
  if (reason && typeof reason === 'object' && 'stack' in reason) {
    console.error('[affise-mcp] Stack:', globalErrorHandler.sanitizeErrorMessage(String((reason as Error).stack)));
  }
  process.exit(1);
});

// Security cleanup on process termination
process.on('SIGINT', () => {
  clearSecureConfig();
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearSecureConfig();
  process.exit(0);
});

// Create MCP server instance
const mcpServer = new McpServer(
  {
    name: 'affise-mcp-server',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {},
      prompts: {}, // AI-powered analytics prompts
      resources: {} // role playbooks served at skill://affise/*
    },
    instructions: SERVER_INSTRUCTIONS
  }
);

// Low-level handle for the unconfigured status fallback, which still speaks
// the raw request-schema API.
const server: Server = mcpServer.server;

// Load configuration
let config: { baseUrl: string; apiKey: string } | null = null;

// Initialize configuration
async function initializeConfig() {
  try {
    config = await loadConfig();
    
    if (config && process.env.NODE_ENV === 'development') {
      console.error(`✅ Configuration loaded: ${config.baseUrl}`);
    }
  } catch (error) {
    // Log error but don't exit - let server start without config
    console.error('❌ Configuration error:', error);
    config = null;
  }
}

// Setup a basic status tool that works without config
function setupStatusTool(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const status = getConfigStatus();
    
    if (!status.configured) {
      return {
        tools: [
          {
            name: "affise_status",
            description: "Check Affise configuration status and get setup instructions",
            inputSchema: {
              type: "object",
              properties: {}
            }
          }
        ]
      };
    }

    // If configured, return all tools (this will be handled by setupEnhancedHandlers)
    return { tools: [] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    
    if (name === "affise_status") {
      const status = getConfigStatus();
      return {
        content: [
          {
            type: "text",
            text: status.configured 
              ? "✅ Affise extension is configured and ready to use!"
              : "⚠️  Affise extension needs configuration.\n\nPlease set up your credentials in Claude Desktop:\n1. Go to Settings → Extensions\n2. Find 'Affise Analytics Extension'\n3. Configure your Base URL and API Key\n4. Restart the extension"
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: "❌ Tool not available. Please configure your Affise credentials first."
        }
      ]
    };
  });
}

// Start the server
async function main() {
  console.error('[affise-mcp] starting; node=' + process.version + ' env_has_creds=' + Boolean(process.env.AFFISE_BASE_URL && process.env.AFFISE_API_KEY));

  await initializeConfig();
  console.error('[affise-mcp] config ' + (config ? 'loaded (' + config.baseUrl + ')' : 'missing — falling back to status-only tool'));

  if (config) {
    setupEnhancedHandlers(mcpServer, config);
    setupPromptHandlers(mcpServer, config);
    setupSkillResources(mcpServer);
    console.error('[affise-mcp] handlers registered ('
      + Object.keys(TOOL_SCHEMAS).length + ' tools + ' + PROMPT_NAMES.length + ' prompts + '
      + Object.keys(SKILL_RESOURCES).length + ' skills)');
  } else {
    setupStatusTool(server);
    console.error('[affise-mcp] status-only handler registered');
  }

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('[affise-mcp] stdio transport connected, awaiting messages');

  // Setup graceful shutdown
  process.on('SIGINT', () => {
    if (process.env.NODE_ENV === 'development') {
      console.error('\n🛑 Shutting down server...');
    }
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

// Error handling
main().catch((error) => {
  console.error('[affise-mcp] Server error:', error?.message || error);
  if (error?.stack) {
    console.error('[affise-mcp] Stack:', error.stack);
  }
  process.exit(1);
});

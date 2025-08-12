#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, getConfigStatus, clearSecureConfig } from './config.js';
import { setupEnhancedHandlers } from './handlers/enhanced-tools.js';
import { setupPromptHandlers } from './handlers/prompts.js';
import { ErrorHandlerService } from './services/error-handler-service.js';

// Initialize error handler for global error sanitization
const globalErrorHandler = new ErrorHandlerService();

// Global error handlers for production stability
process.on('uncaughtException', (error: Error) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('💥 Uncaught Exception:', globalErrorHandler.sanitizeErrorMessage(error.message));
    console.error('Stack trace:', globalErrorHandler.sanitizeErrorMessage(error.stack || ''));
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('💥 Unhandled Rejection detected');
    console.error('Reason:', globalErrorHandler.sanitizeErrorMessage(String(reason)));
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
const server = new Server(
  {
    name: 'affise-mcp-server',
    version: '1.2.0' // Updated version for enhanced features
  },
  {
    capabilities: {
      tools: {},
      prompts: {} // AI-powered analytics prompts
    }
  }
);

// Load configuration
let config: { baseUrl: string; apiKey: string } | null = null;

// Initialize configuration
async function initializeConfig() {
  try {
    config = await loadConfig();
    
    if (config && process.env.NODE_ENV === 'development') {
      console.info(`✅ Configuration loaded: ${config.baseUrl}`);
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
  // Initialize config without exiting on failure
  await initializeConfig();
  
  if (config) {
    // Setup full handlers if config is available
    setupEnhancedHandlers(server, config);
    setupPromptHandlers(server, config);
  } else {
    // Setup basic status tool if config is missing
    setupStatusTool(server);
  }
  
  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  // Setup graceful shutdown
  process.on('SIGINT', () => {
    if (process.env.NODE_ENV === 'development') {
      console.info('\n🛑 Shutting down server...');
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    process.exit(0);
  });
}

// Error handling
main().catch((error) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('💥 Server error:', error);
  }
  process.exit(1);
});

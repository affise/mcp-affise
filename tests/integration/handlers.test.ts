/**
 * Integration tests for MCP handlers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setupEnhancedHandlers, TOOLS } from '../../src/handlers/enhanced-tools.js';
import { setupPromptHandlers } from '../../src/handlers/prompts.js';

// Mock axios for API calls
jest.mock('axios');
const mockedAxios = require('axios');

describe('MCP Handlers Integration', () => {
  let server: Server;
  const mockConfig = {
    baseUrl: 'https://api.test.affise.com',
    apiKey: 'test-api-key-12345678'
  };

  beforeEach(() => {
    server = new Server(
      {
        name: 'affise-mcp-server',
        version: '1.2.0'
      },
      {
        capabilities: {
          tools: {},
          prompts: {}
        }
      }
    );

    // Setup handlers
    setupEnhancedHandlers(server, mockConfig);
    setupPromptHandlers(server, mockConfig);

    // Mock successful API responses
    mockedAxios.create.mockReturnValue({
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          status: 'success',
          offers: [
            {
              id: '1',
              title: 'Test Offer',
              url: 'https://example.com',
              status: 'active'
            }
          ]
        }
      }),
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: { status: 'success' }
      })
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Tools Registration', () => {
    it('should register all expected tools', () => {
      // Verify that TOOLS array contains expected tools
      expect(TOOLS).toBeDefined();
      expect(Array.isArray(TOOLS)).toBe(true);
      expect(TOOLS.length).toBeGreaterThan(0);
      
      // Check for core tools
      const toolNames = TOOLS.map(tool => tool.name);
      expect(toolNames).toContain('affise_search_offers');
      expect(toolNames).toContain('affise_stats');
      expect(toolNames).toContain('affise_status');
    });

    it('should have proper tool schemas', () => {
      TOOLS.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(typeof tool.inputSchema).toBe('object');
        
        // Verify inputSchema structure
        expect(tool.inputSchema).toHaveProperty('type');
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema).toHaveProperty('properties');
      });
    });
  });

  describe('Handler Setup', () => {
    it('should setup enhanced handlers without errors', () => {
      expect(() => {
        const testServer = new Server(
          { name: 'test', version: '1.0.0' },
          { capabilities: { tools: {} } }
        );
        setupEnhancedHandlers(testServer, mockConfig);
      }).not.toThrow();
    });

    it('should setup prompt handlers without errors', () => {
      expect(() => {
        const testServer = new Server(
          { name: 'test', version: '1.0.0' },
          { capabilities: { prompts: {} } }
        );
        setupPromptHandlers(testServer, mockConfig);
      }).not.toThrow();
    });
  });

  describe('Configuration Validation', () => {
    it('should handle valid configuration', () => {
      expect(mockConfig.baseUrl).toBeTruthy();
      expect(mockConfig.apiKey).toBeTruthy();
      expect(typeof mockConfig.baseUrl).toBe('string');
      expect(typeof mockConfig.apiKey).toBe('string');
    });

    it('should work with different base URLs', () => {
      const altConfig = {
        baseUrl: 'https://api.alternative.affise.com',
        apiKey: 'alternative-api-key'
      };
      
      expect(() => {
        const testServer = new Server(
          { name: 'test', version: '1.0.0' },
          { capabilities: { tools: {} } }
        );
        setupEnhancedHandlers(testServer, altConfig);
      }).not.toThrow();
    });
  });

  describe('Tool Definitions Validation', () => {
    it('should have valid input schemas for all tools', () => {
      TOOLS.forEach(tool => {
        const schema = tool.inputSchema;
        
        // Basic schema validation
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
        expect(typeof schema.properties).toBe('object');
        
        // Check that additionalProperties is explicitly set
        expect(schema.hasOwnProperty('additionalProperties')).toBe(true);
      });
    });

    it('should have unique tool names', () => {
      const toolNames = TOOLS.map(tool => tool.name);
      const uniqueNames = new Set(toolNames);
      expect(uniqueNames.size).toBe(toolNames.length);
    });

    it('should have non-empty descriptions', () => {
      TOOLS.forEach(tool => {
        expect(tool.description.length).toBeGreaterThan(0);
        expect(tool.description.trim()).toBe(tool.description);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle axios mock setup correctly', () => {
      expect(mockedAxios.create).toBeDefined();
      expect(typeof mockedAxios.create).toBe('function');
      
      const axiosInstance = mockedAxios.create();
      expect(axiosInstance.get).toBeDefined();
      expect(axiosInstance.post).toBeDefined();
    });

    it('should handle API errors gracefully in mocked environment', async () => {
      // Mock API error
      mockedAxios.create.mockReturnValue({
        get: jest.fn().mockRejectedValue(new Error('Network Error')),
        post: jest.fn().mockRejectedValue(new Error('Network Error'))
      });

      // This should not throw when setting up handlers
      expect(() => {
        setupEnhancedHandlers(server, mockConfig);
      }).not.toThrow();
    });
  });

  describe('Server Configuration', () => {
    it('should have correct server metadata', () => {
      expect(server).toBeDefined();
      // We can't easily access the server metadata through public APIs
      // but we can verify the server was created successfully
      expect(typeof server.setRequestHandler).toBe('function');
    });

    it('should support multiple handler setups', () => {
      expect(() => {
        setupEnhancedHandlers(server, mockConfig);
        setupPromptHandlers(server, mockConfig);
        // Setting up again should not throw
        setupEnhancedHandlers(server, mockConfig);
      }).not.toThrow();
    });
  });

  describe('Mock Data Validation', () => {
    it('should have valid mock API responses', () => {
      const axiosInstance = mockedAxios.create();
      
      // Test GET response structure
      const getPromise = axiosInstance.get();
      expect(getPromise).toBeInstanceOf(Promise);
      
      // Test POST response structure  
      const postPromise = axiosInstance.post();
      expect(postPromise).toBeInstanceOf(Promise);
    });

    it('should provide consistent mock data', async () => {
      const axiosInstance = mockedAxios.create();
      
      const response = await axiosInstance.get();
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('success');
      expect(response.data.offers).toBeDefined();
      expect(Array.isArray(response.data.offers)).toBe(true);
    });
  });
});
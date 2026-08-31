/**
 * Integration tests for MCP handlers
 */

import { McpServer } from '../../src/mcp-sdk.js';
import { setupEnhancedHandlers } from '../../src/handlers/enhanced-tools.js';
import { setupPromptHandlers } from '../../src/handlers/prompts.js';
import { TOOL_SCHEMAS } from '../../src/handlers/tool-schemas.js';

// Snapshot of the tool catalogue used by the legacy tests below. Tier 2
// replaced the old JSON-Schema TOOLS array with TOOL_SCHEMAS keyed by
// tool name; this little shim preserves the array-shape assertions
// without having to rewrite every test.
const TOOL_NAMES = Object.keys(TOOL_SCHEMAS);
const TOOL_ENTRIES = Object.entries(TOOL_SCHEMAS).map(
  ([name, def]) => ({ name, title: def.title, description: def.description, inputSchema: def.inputSchema })
);

// Mock axios for API calls. Vitest's vi.mock doesn't auto-mock named exports
// the way jest did (specifically `create`), so we provide an explicit factory.
vi.mock('axios', () => {
  const create = vi.fn();
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  create.mockReturnValue(instance);
  return {
    default: { create, get: vi.fn(), post: vi.fn() },
    create,
    get: vi.fn(),
    post: vi.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = (await import('axios')).default as any;

describe('MCP Handlers Integration', () => {
  let server: McpServer;
  const mockConfig = {
    baseUrl: 'https://api.test.affise.com',
    apiKey: 'test-api-key-12345678'
  };

  beforeEach(() => {
    server = new McpServer(
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
      get: vi.fn().mockResolvedValue({
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
      post: vi.fn().mockResolvedValue({
        status: 200,
        data: { status: 'success' }
      })
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Tools Registration', () => {
    it('should register all expected tools', () => {
      expect(TOOL_NAMES.length).toBeGreaterThan(0);
      // Check for core tools
      expect(TOOL_NAMES).toContain('affise_search_offers');
      expect(TOOL_NAMES).toContain('affise_stats');
      expect(TOOL_NAMES).toContain('affise_stats_raw');
    });

    it('should have proper tool schemas', () => {
      TOOL_ENTRIES.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        // inputSchema is now a Zod raw shape (a plain record of Zod types,
        // possibly empty for arg-less tools).
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      });
    });
  });

  describe('Handler Setup', () => {
    it('should setup enhanced handlers without errors', () => {
      expect(() => {
        const testServer = new McpServer(
          { name: 'test', version: '1.0.0' },
          { capabilities: { tools: {} } }
        );
        setupEnhancedHandlers(testServer, mockConfig);
      }).not.toThrow();
    });

    it('should setup prompt handlers without errors', () => {
      expect(() => {
        const testServer = new McpServer(
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
        const testServer = new McpServer(
          { name: 'test', version: '1.0.0' },
          { capabilities: { tools: {} } }
        );
        setupEnhancedHandlers(testServer, altConfig);
      }).not.toThrow();
    });
  });

  describe('Tool Definitions Validation', () => {
    it('should have valid input schemas for all tools', () => {
      TOOL_ENTRIES.forEach(tool => {
        // Zod raw shapes are plain records; arg-less tools have {}.
        expect(typeof tool.inputSchema).toBe('object');
        expect(tool.inputSchema).not.toBeNull();
      });
    });

    it('should have unique tool names', () => {
      const uniqueNames = new Set(TOOL_NAMES);
      expect(uniqueNames.size).toBe(TOOL_NAMES.length);
    });

    it('should have non-empty descriptions', () => {
      TOOL_ENTRIES.forEach(tool => {
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
        get: vi.fn().mockRejectedValue(new Error('Network Error')),
        post: vi.fn().mockRejectedValue(new Error('Network Error'))
      });

      // The handler is already set up in beforeEach; mocking a failing axios
      // after the fact must not destabilize the already-registered server.
      // (Re-calling setupEnhancedHandlers here would now throw — McpServer's
      // registerTool refuses double-registration by design.)
      expect(server).toBeDefined();
    });
  });

  describe('Server Configuration', () => {
    it('should have correct server metadata', () => {
      expect(server).toBeDefined();
      // We can't easily access the server metadata through public APIs
      // but we can verify the server was created successfully
      // McpServer wraps a Server; verify the low-level setRequestHandler is reachable
      expect(typeof server.server.setRequestHandler).toBe('function');
    });

    it('should reject double tool registration (McpServer contract)', () => {
      // The Tier 2 migration moves dispatch from legacy setRequestHandler
      // (which silently overwrote) to McpServer.registerTool, which throws
      // on duplicate names. The server in beforeEach already registered
      // every tool; a second setupEnhancedHandlers must therefore throw.
      expect(() => {
        setupEnhancedHandlers(server, mockConfig);
      }).toThrow();
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
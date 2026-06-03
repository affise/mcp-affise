/**
 * Test setup and configuration (Vitest)
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
process.env.AFFISE_API_KEY = 'test-api-key-for-testing-purposes-only';

// Suppress console output during tests unless debugging
const originalConsoleError = console.error;
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  if (!process.env.DEBUG_TESTS) {
    console.error = vi.fn();
    console.log = vi.fn();
    console.warn = vi.fn();
  }
});

afterAll(() => {
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

// Mock external dependencies that shouldn't be called during tests
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockResolvedValue({
      baseUrl: 'https://api.test.affise.com',
      apiKey: 'test-api-key',
    }),
  },
  prompt: vi.fn().mockResolvedValue({
    baseUrl: 'https://api.test.affise.com',
    apiKey: 'test-api-key',
  }),
}));

// Clean up environment after each test
afterEach(() => {
  vi.clearAllMocks();

  // Reset environment variables to test defaults
  process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
  process.env.AFFISE_API_KEY = 'test-api-key-for-testing-purposes-only';
});

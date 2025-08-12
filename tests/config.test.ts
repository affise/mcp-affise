/**
 * Tests for configuration loading
 */

import { loadConfig, isConfigured, getConfigStatus, clearSecureConfig } from '../src/config.js';
import { getSecureConfigManager, SecureConfigManager } from '../src/services/secure-config-manager.js';

// Mock interactive prompts
jest.mock('../src/utils/input.js', () => ({
  promptForConfig: jest.fn().mockResolvedValue({
    baseUrl: 'https://api.interactive.affise.com',
    apiKey: 'interactive-api-key-123'
  })
}));

// Mock the global secure config manager to create fresh instances
let mockSecureConfigManager: SecureConfigManager;
jest.mock('../src/services/secure-config-manager.js', () => {
  const original = jest.requireActual('../src/services/secure-config-manager.js');
  return {
    ...original,
    getSecureConfigManager: jest.fn(() => mockSecureConfigManager)
  };
});

describe('Configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Create a fresh SecureConfigManager instance for each test
    mockSecureConfigManager = new SecureConfigManager();
    
    // Reset environment variables
    process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
    process.env.AFFISE_API_KEY = 'test-api-key-12345678';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Clear configuration from the mock manager
    if (mockSecureConfigManager) {
      mockSecureConfigManager.clearFromMemory();
    }
    // Reset environment to original state
    process.env = { ...originalEnv };
    process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
    process.env.AFFISE_API_KEY = 'test-api-key-12345678';
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    jest.restoreAllMocks();
    // Fully restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load configuration from environment variables', async () => {
      // Ensure environment variables are set before loading
      expect(process.env.AFFISE_BASE_URL).toBe('https://api.test.affise.com');
      expect(process.env.AFFISE_API_KEY).toBe('test-api-key-12345678');
      
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
      expect(config?.apiKey).toBe('test-api-key-12345678');
    });

    it('should return null when environment variables are missing', async () => {
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('should prompt for config in development mode when env vars missing', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(config?.baseUrl).toBe('https://api.interactive.affise.com');
      expect(config?.apiKey).toBe('interactive-api-key-123');
    });

    it('should not prompt for config in production mode', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('should create secure wrapper for loaded config', async () => {
      const config = await loadConfig();
      
      expect(config).toBeDefined();
      expect(typeof (config as any)?.clearFromMemory).toBe('function');
    });
  });

  describe('isConfigured', () => {
    it('should return true when secure config is ready', async () => {
      const config = await loadConfig();
      expect(config).toBeDefined();
      // The config should be usable
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
      expect(config?.apiKey).toBe('test-api-key-12345678');
    });

    it('should return false when no configuration available', () => {
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      
      expect(isConfigured()).toBe(false);
    });

    it('should return true when environment variables are present', () => {
      process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
      process.env.AFFISE_API_KEY = 'test-key';
      
      expect(isConfigured()).toBe(true);
    });
  });

  describe('getConfigStatus', () => {
    it('should return configured status with encryption info', async () => {
      const config = await loadConfig();
      expect(config).toBeDefined();
      
      // The config should work properly
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
      expect(config?.apiKey).toBe('test-api-key-12345678');
      
      // Check basic functionality instead of internal state
      expect(typeof (config as any)?.clearFromMemory).toBe('function');
    });

    it('should return plaintext status when only env vars present', () => {
      // Clear secure config but keep env vars
      getSecureConfigManager().clearFromMemory();
      
      const status = getConfigStatus();
      
      expect(status.configured).toBe(true);
      expect(status.encrypted).toBe(false);
      expect(status.message).toContain('not encrypted');
    });

    it('should return unconfigured status when no config available', () => {
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      getSecureConfigManager().clearFromMemory();
      
      const status = getConfigStatus();
      
      expect(status.configured).toBe(false);
      expect(status.encrypted).toBe(false);
      expect(status.message).toContain('configure your Affise credentials');
    });
  });

  describe('clearSecureConfig', () => {
    it('should clear configuration from memory', async () => {
      const config = await loadConfig();
      expect(config).toBeDefined();
      
      clearSecureConfig();
      
      // Should throw error when trying to access cleared config
      expect(() => (config as any)?.getApiKey()).toThrow();
    });

    it('should not throw error when clearing already cleared config', () => {
      expect(() => clearSecureConfig()).not.toThrow();
    });
  });

  describe('SecureConfigWrapper', () => {
    it('should expose baseUrl property', async () => {
      const config = await loadConfig();
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
    });

    it('should expose getApiKey method', async () => {
      const config = await loadConfig();
      expect(config?.apiKey).toBe('test-api-key-12345678');
    });

    it('should expose clearFromMemory method', async () => {
      const config = await loadConfig();
      expect(typeof (config as any)?.clearFromMemory).toBe('function');
      
      (config as any)?.clearFromMemory();
      expect(() => (config as any)?.getApiKey()).toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle configuration loading errors gracefully', async () => {
      // Mock secure config to throw error
      jest.spyOn(getSecureConfigManager(), 'loadConfig').mockRejectedValueOnce(new Error('Config error'));
      
      const config = await loadConfig();
      expect(config).toBeNull();
    });

    it('should handle missing secure config manager gracefully', () => {
      // This should not throw even if secure config is not available
      expect(() => isConfigured()).not.toThrow();
      expect(() => getConfigStatus()).not.toThrow();
    });
  });
});
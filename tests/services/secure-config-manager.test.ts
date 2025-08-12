/**
 * Tests for SecureConfigManager
 */

import { SecureConfigManager, getSecureConfigManager, initializeSecureConfig } from '../../src/services/secure-config-manager.js';

describe('SecureConfigManager', () => {
  let manager: SecureConfigManager;

  beforeEach(() => {
    manager = new SecureConfigManager();
    // Reset environment
    process.env.AFFISE_BASE_URL = 'https://api.test.affise.com';
    process.env.AFFISE_API_KEY = 'test-api-key-12345678';
  });

  afterEach(() => {
    manager.clearFromMemory();
  });

  describe('loadConfig', () => {
    it('should load and encrypt configuration from environment variables', async () => {
      const config = await manager.loadConfig();
      
      expect(config).toBeDefined();
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
      expect(config?.getApiKey()).toBe('test-api-key-12345678');
    });

    it('should return null when environment variables are missing', async () => {
      delete process.env.AFFISE_BASE_URL;
      delete process.env.AFFISE_API_KEY;
      
      const config = await manager.loadConfig();
      expect(config).toBeNull();
    });

    it('should return null when only base URL is provided', async () => {
      delete process.env.AFFISE_API_KEY;
      
      const config = await manager.loadConfig();
      expect(config).toBeNull();
    });

    it('should return null when only API key is provided', async () => {
      delete process.env.AFFISE_BASE_URL;
      
      const config = await manager.loadConfig();
      expect(config).toBeNull();
    });

    it('should handle invalid API key format gracefully', async () => {
      process.env.AFFISE_API_KEY = 'short';
      
      const config = await manager.loadConfig();
      // Should still create config but log security violation
      expect(config).toBeDefined();
    });
  });

  describe('configuration status', () => {
    it('should report correct status when configured', async () => {
      await manager.loadConfig();
      
      const status = manager.getConfigStatus();
      expect(status.configured).toBe(true);
      expect(status.encrypted).toBe(true);
      expect(status.message).toContain('encrypted securely');
    });

    it('should report correct status when not configured', () => {
      const status = manager.getConfigStatus();
      expect(status.configured).toBe(false);
      expect(status.encrypted).toBe(false);
      expect(status.message).toContain('configure your Affise credentials');
    });

    it('should detect configuration readiness', async () => {
      expect(manager.isConfigurationReady()).toBe(false);
      
      await manager.loadConfig();
      expect(manager.isConfigurationReady()).toBe(true);
    });
  });

  describe('memory management', () => {
    it('should clear configuration from memory', async () => {
      const config = await manager.loadConfig();
      expect(config).toBeDefined();
      expect(manager.isConfigurationReady()).toBe(true);
      
      manager.clearFromMemory();
      expect(manager.isConfigurationReady()).toBe(false);
    });

    it('should throw error when accessing cleared API key', async () => {
      const config = await manager.loadConfig();
      expect(config).toBeDefined();
      
      manager.clearFromMemory();
      expect(() => config!.getApiKey()).toThrow('API key not configured or already cleared');
    });
  });

  describe('encryption/decryption', () => {
    it('should encrypt and decrypt API key correctly', async () => {
      const originalKey = 'test-api-key-12345678';
      process.env.AFFISE_API_KEY = originalKey;
      
      const config = await manager.loadConfig();
      expect(config?.getApiKey()).toBe(originalKey);
    });

        // it('should handle encryption errors gracefully', async () => {
    //   jest.spyOn(crypto, 'createCipheriv').mockImplementation(() => {
    //     throw new Error('Encryption error');
    //   });

    //   const manager = new SecureConfigManager();
    //   const config = await manager.loadConfig();
    //   expect(config).toBeNull();

    //   jest.unmock('crypto');
    // });
  });

  describe('global instance', () => {
    it('should return the same global instance', () => {
      const manager1 = getSecureConfigManager();
      const manager2 = getSecureConfigManager();
      
      expect(manager1).toBe(manager2);
    });

    it('should initialize secure config through global function', async () => {
      const config = await initializeSecureConfig();
      
      expect(config).toBeDefined();
      expect(config?.baseUrl).toBe('https://api.test.affise.com');
    });
  });

  describe('environment variable clearing', () => {
    it('should clear API key from environment after loading', async () => {
      process.env.AFFISE_API_KEY = 'test-key-to-be-cleared';
      
      await manager.loadConfig();
      
      // Environment variable should be cleared for security
      expect(process.env.AFFISE_API_KEY).toBeUndefined();
    });

    it('should preserve base URL in environment', async () => {
      const baseUrl = 'https://api.test.affise.com';
      process.env.AFFISE_BASE_URL = baseUrl;
      
      await manager.loadConfig();
      
      // Base URL should remain (not sensitive)
      expect(process.env.AFFISE_BASE_URL).toBe(baseUrl);
    });
  });
});
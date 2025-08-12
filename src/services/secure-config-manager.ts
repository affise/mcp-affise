/**
 * Secure Configuration Manager - Runtime API Key Encryption
 * Encrypts API keys in memory while maintaining simple client setup
 */

import crypto from 'crypto';
import os from 'os';
import { SecurityAuditLogger, validateApiKeyFormat, secureMemoryClear, createSecureTimer } from '../utils/security-utils.js';

export interface SecureConfig {
  baseUrl: string;
  getApiKey(): string;
  clearFromMemory(): void;
}

export class SecureConfigManager {
  private encryptedApiKey: string | null = null;
  private masterKey: string;
  private baseUrl: string;
  private isConfigured: boolean = false;

  constructor() {
    this.masterKey = this.generateMasterKey();
    this.baseUrl = '';
  }

  /**
   * Load configuration from environment variables
   * Automatically encrypts API key and clears plaintext
   */
  async loadConfig(): Promise<SecureConfig | null> {
    const baseUrl = process.env.AFFISE_BASE_URL;
    const plaintextApiKey = process.env.AFFISE_API_KEY;

    // If no config provided, return null silently (for MCP extensions)
    if (!baseUrl || !plaintextApiKey) {
      return null;
    }

    // Validate API key format (silent validation for MCP compatibility)
    if (!validateApiKeyFormat(plaintextApiKey)) {
      SecurityAuditLogger.logSecurityViolation('Invalid API key format');
    }

    try {
      // Encrypt the API key immediately
      this.encryptedApiKey = this.encryptApiKey(plaintextApiKey);
      this.baseUrl = baseUrl;
      this.isConfigured = true;

      // Clear plaintext from environment (security measure)
      this.clearEnvironmentVariable('AFFISE_API_KEY');
      
      // Clear the plaintext variable from memory
      secureMemoryClear(plaintextApiKey);

      // Only log in development mode to avoid MCP protocol issues
      if (process.env.NODE_ENV === 'development') {
        console.log('🔒 API key encrypted and stored securely in memory');
      }
      SecurityAuditLogger.logConfigEncrypted();

      return this.createSecureConfig();

    } catch (error: any) {
      SecurityAuditLogger.logEncryptionError(error);
      return null;
    }
  }

  /**
   * Create secure config interface
   */
  private createSecureConfig(): SecureConfig {
    return {
      baseUrl: this.baseUrl,
      getApiKey: () => this.getDecryptedApiKey(),
      clearFromMemory: () => this.clearFromMemory()
    };
  }

  /**
   * Get decrypted API key for API calls
   * Automatically schedules memory cleanup
   */
  private getDecryptedApiKey(): string {
    if (!this.encryptedApiKey) {
      throw new Error('API key not configured or already cleared');
    }

    try {
      const decryptedKey = this.decryptApiKey(this.encryptedApiKey);
      
      // Log API key access for security auditing
      SecurityAuditLogger.logApiKeyAccess();
      
      // Schedule memory cleanup after short delay
      createSecureTimer(decryptedKey, 5000, () => {
        // Silent cleanup - no console.log in MCP servers
      });
      
      return decryptedKey;
    } catch (error: any) {
      SecurityAuditLogger.logEncryptionError(error);
      throw new Error(`Failed to decrypt API key: ${error.message}`);
    }
  }

  /**
   * Encrypt API key using AES-256-GCM
   */
  private encryptApiKey(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const key = Buffer.from(this.masterKey.substring(0, 32), 'utf8');
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from('affise-mcp-api-key'));
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Combine IV + AuthTag + Encrypted data
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt API key using AES-256-GCM
   */
  private decryptApiKey(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      const key = Buffer.from(this.masterKey.substring(0, 32), 'utf8');

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from('affise-mcp-api-key'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate master key from system properties
   * Note: This is not as secure as user-provided keys, but practical for runtime encryption
   */
  private generateMasterKey(): string {
    try {
      // Generate from system properties + app identifier
      const systemInfo = [
        os.hostname(),
        os.userInfo().username,
        process.pid.toString(),
        'affise-mcp-server-v1.2.0',
        Date.now().toString().slice(0, -3) // Remove last 3 digits for some time stability
      ].join('|');

      return crypto.createHash('sha256')
        .update(systemInfo)
        .digest('hex');
    } catch (error) {
      // Fallback if system info unavailable
      console.warn('⚠️  Using fallback key generation');
      return crypto.createHash('sha256')
        .update('affise-mcp-fallback-key-' + process.pid)
        .digest('hex');
    }
  }


  /**
   * Clear environment variable
   */
  private clearEnvironmentVariable(varName: string): void {
    try {
      delete process.env[varName];
    } catch (error) {
      // Silent fail if deletion not allowed
    }
  }

  /**
   * Clear all sensitive data from memory
   */
  public clearFromMemory(): void {
    if (this.encryptedApiKey) {
      secureMemoryClear(this.encryptedApiKey);
      this.encryptedApiKey = null;
    }
    
    if (this.masterKey) {
      secureMemoryClear(this.masterKey);
      this.masterKey = '';
    }
    
    this.isConfigured = false;
    // Note: No console.log in MCP servers (breaks stdio protocol)
    SecurityAuditLogger.logConfigCleared();
  }

  /**
   * Check if configuration is loaded and valid
   */
  public isConfigurationReady(): boolean {
    return this.isConfigured && !!this.encryptedApiKey && !!this.baseUrl;
  }

  /**
   * Get configuration status for diagnostic tools
   */
  public getConfigStatus(): { configured: boolean; message: string; encrypted: boolean } {
    if (this.isConfigurationReady()) {
      return {
        configured: true,
        encrypted: true,
        message: "✅ Affise configuration loaded and encrypted securely"
      };
    } else {
      return {
        configured: false,
        encrypted: false,
        message: "⚠️  Please configure your Affise credentials (AFFISE_BASE_URL and AFFISE_API_KEY)"
      };
    }
  }
}

// Global instance
let globalSecureConfigManager: SecureConfigManager | null = null;

/**
 * Get global secure config manager instance
 */
export function getSecureConfigManager(): SecureConfigManager {
  if (!globalSecureConfigManager) {
    globalSecureConfigManager = new SecureConfigManager();
  }
  return globalSecureConfigManager;
}

/**
 * Initialize secure configuration (called once on startup)
 */
export async function initializeSecureConfig(): Promise<SecureConfig | null> {
  const manager = getSecureConfigManager();
  return await manager.loadConfig();
}
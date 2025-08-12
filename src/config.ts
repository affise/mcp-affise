import * as dotenv from 'dotenv';
import { promptForConfig } from './utils/input.js';
import { initializeSecureConfig, getSecureConfigManager, type SecureConfig } from './services/secure-config-manager.js';

dotenv.config();

/**
 * Legacy interface for backward compatibility
 */
export interface LegacyConfig {
  baseUrl: string;
  apiKey: string;
}

/**
 * Secure configuration wrapper that provides legacy interface
 */
class SecureConfigWrapper implements LegacyConfig {
  constructor(private secureConfig: SecureConfig) {}

  get baseUrl(): string {
    return this.secureConfig.baseUrl;
  }

  get apiKey(): string {
    return this.secureConfig.getApiKey();
  }

  // Expose secure methods
  clearFromMemory(): void {
    this.secureConfig.clearFromMemory();
  }
}

/**
 * Load configuration with runtime encryption
 * Client setup remains unchanged - encryption happens internally
 */
export async function loadConfig(): Promise<LegacyConfig | null> {
  // Try secure config first
  const secureConfig = await initializeSecureConfig();
  if (secureConfig) {
    return new SecureConfigWrapper(secureConfig);
  }

  // Fallback to development prompts (less secure)
  if (process.env.NODE_ENV === 'development') {
    console.error("⚠️  Missing AFFISE_BASE_URL or AFFISE_API_KEY in environment variables.");
    console.error("Please set them in .env file or environment, or provide them interactively:");
    
    const interactiveConfig = await promptForConfig();
    if (interactiveConfig) {
      // Even interactive config should be secured
      process.env.AFFISE_BASE_URL = interactiveConfig.baseUrl;
      process.env.AFFISE_API_KEY = interactiveConfig.apiKey;
      
      const secureConfig = await initializeSecureConfig();
      if (secureConfig) {
        return new SecureConfigWrapper(secureConfig);
      }
      
      // Fallback to plaintext (not recommended)
      console.warn('⚠️  Using plaintext configuration (not secure)');
      return interactiveConfig;
    }
  }

  // For Desktop Extensions/Production - return null silently when no config
  // The status tool will provide setup instructions to users

  return null;
}

/**
 * Helper function to check if configuration is available
 */
export function isConfigured(): boolean {
  return getSecureConfigManager().isConfigurationReady() || 
         !!(process.env.AFFISE_BASE_URL && process.env.AFFISE_API_KEY);
}

/**
 * Get configuration status for tools
 */
export function getConfigStatus(): { configured: boolean; message: string; encrypted?: boolean } {
  const secureStatus = getSecureConfigManager().getConfigStatus();
  
  if (secureStatus.configured) {
    return {
      configured: true,
      encrypted: secureStatus.encrypted,
      message: secureStatus.message
    };
  }

  // Check for plaintext fallback
  if (!!(process.env.AFFISE_BASE_URL && process.env.AFFISE_API_KEY)) {
    return {
      configured: true,
      encrypted: false,
      message: "⚠️  Configuration loaded but not encrypted (restart recommended)"
    };
  }

  return {
    configured: false,
    encrypted: false,
    message: "⚠️  Please configure your Affise credentials in Claude Desktop Extensions settings"
  };
}

/**
 * Clear all configuration from memory (security cleanup)
 */
export function clearSecureConfig(): void {
  getSecureConfigManager().clearFromMemory();
}

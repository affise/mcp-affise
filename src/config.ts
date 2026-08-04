import * as dotenv from 'dotenv';
import { initializeSecureConfig, getSecureConfigManager, type SecureConfig } from './services/secure-config-manager.js';

// dotenv >= 17 logs an injection banner via console.log by default; stdout is
// reserved for JSON-RPC on the stdio transport, so it must stay quiet.
process.env.DOTENV_CONFIG_QUIET ??= 'true';
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

  if (process.env.NODE_ENV === 'development') {
    console.error('⚠️  Missing AFFISE_BASE_URL or AFFISE_API_KEY. Set them via .env or Claude Desktop extension settings.');
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

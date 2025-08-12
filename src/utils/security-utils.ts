/**
 * Security Utilities - Memory management and secure operations
 */

/**
 * Securely clear sensitive data from memory
 * Best effort approach - not guaranteed on all platforms
 */
export function secureMemoryClear(data: any): void {
  if (typeof data === 'string' && data.length > 0) {
    try {
      // Overwrite string memory with zeros (best effort)
      (data as any) = '\0'.repeat(data.length);
    } catch (error) {
      // Silent fail - not all environments support direct memory manipulation
    }
  } else if (typeof data === 'object' && data !== null) {
    try {
      // Clear object properties
      Object.keys(data).forEach(key => {
        if (typeof data[key] === 'string') {
          (data[key] as any) = '\0'.repeat(data[key].length);
        }
        delete data[key];
      });
    } catch (error) {
      // Silent fail
    }
  }
}

/**
 * Create a secure timer that clears data after specified time
 */
export function createSecureTimer(
  data: any, 
  clearTimeMs: number = 5000,
  onClear?: () => void
): NodeJS.Timeout {
  return setTimeout(() => {
    secureMemoryClear(data);
    if (onClear) {
      onClear();
    }
  }, clearTimeMs);
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (!data || typeof data !== 'string') {
    return '[MASKED]';
  }
  
  if (data.length <= visibleChars) {
    return '*'.repeat(data.length);
  }
  
  return data.substring(0, visibleChars) + '*'.repeat(data.length - visibleChars);
}

/**
 * Generate secure random string
 */
export function generateSecureRandom(length: number = 32): string {
  const crypto = require('crypto');
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * Validate API key format (basic security check)
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== 'string') {
    return false;
  }
  
  // Basic checks for Affise API key format
  if (apiKey.length < 16) {
    return false;
  }
  
  // Check for common placeholder values
  const invalidKeys = [
    'your_api_key_here',
    'replace_with_your_key',
    'api_key_placeholder',
    'test_key',
    'demo_key'
  ];
  
  return !invalidKeys.some(invalid => 
    apiKey.toLowerCase().includes(invalid.toLowerCase())
  );
}

/**
 * Security audit logger - MCP compatible (no console output)
 */
export class SecurityAuditLogger {
  private static securityLog: Array<{
    timestamp: string;
    event: string;
    level: 'info' | 'warn' | 'error';
    details?: any;
  }> = [];

  private static logSecurityEvent(
    event: string, 
    level: 'info' | 'warn' | 'error',
    details?: any
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      level,
      details: details ? maskSensitiveData(JSON.stringify(details)) : undefined
    };
    
    // Store in memory instead of console (MCP servers can't use console.log)
    this.securityLog.push(logEntry);
    
    // Keep only last 100 entries to prevent memory bloat
    if (this.securityLog.length > 100) {
      this.securityLog = this.securityLog.slice(-100);
    }
  }

  /**
   * Get security audit logs (for status/debug tools)
   */
  static getAuditLog(): Array<{
    timestamp: string;
    event: string;
    level: 'info' | 'warn' | 'error';
    details?: any;
  }> {
    return [...this.securityLog];
  }

  /**
   * Clear audit log
   */
  static clearAuditLog(): void {
    this.securityLog = [];
  }
  
  static logConfigEncrypted(): void {
    this.logSecurityEvent('API_KEY_ENCRYPTED', 'info', {
      action: 'Configuration encrypted and stored securely'
    });
  }
  
  static logConfigCleared(): void {
    this.logSecurityEvent('CONFIG_CLEARED', 'info', {
      action: 'Secure configuration cleared from memory'
    });
  }
  
  static logApiKeyAccess(): void {
    this.logSecurityEvent('API_KEY_ACCESS', 'info', {
      action: 'API key decrypted for request'
    });
  }
  
  static logSecurityViolation(violation: string, details?: any): void {
    this.logSecurityEvent('SECURITY_VIOLATION', 'error', {
      violation,
      details
    });
  }
  
  static logEncryptionError(error: Error): void {
    this.logSecurityEvent('ENCRYPTION_ERROR', 'error', {
      error: error.message
    });
  }
}

/**
 * Runtime security checks
 */
export class RuntimeSecurity {
  /**
   * Check if running in secure environment
   */
  static isSecureEnvironment(): boolean {
    // Check for development environment
    if (process.env.NODE_ENV === 'development') {
      return false;
    }
    
    // Check for common development/debug flags
    const debugFlags = [
      'DEBUG',
      'NODE_DEBUG', 
      'VERBOSE',
      'TRACE'
    ];
    
    return !debugFlags.some(flag => process.env[flag]);
  }
  
  /**
   * Check environment for security issues
   */
  static auditEnvironment(): { secure: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for plaintext API keys in environment
    if (process.env.AFFISE_API_KEY && !process.env.AFFISE_API_KEY_ENCRYPTED) {
      issues.push('Plaintext API key found in environment');
    }
    
    // Check for debug modes
    if (!this.isSecureEnvironment()) {
      issues.push('Development/debug mode detected');
    }
    
    // Check for insecure protocols
    if (process.env.AFFISE_BASE_URL && process.env.AFFISE_BASE_URL.startsWith('http://')) {
      issues.push('Insecure HTTP protocol in base URL');
    }
    
    return {
      secure: issues.length === 0,
      issues
    };
  }
}
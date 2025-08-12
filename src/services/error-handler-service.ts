/**
 * Error Handler Service - Centralized error handling with user-friendly messages
 */

export type ErrorCode = 
  | 'TOOL_NOT_FOUND'
  | 'CONFIG_MISSING'
  | 'VALIDATION_ERROR'
  | 'SEARCH_ERROR'
  | 'STATS_ERROR'
  | 'CATEGORIES_ERROR'
  | 'TRAFFICBACK_ERROR'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'TIMEOUT_ERROR'
  | 'UNKNOWN_ERROR';

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  originalError?: Error;
  context?: any;
  suggestions?: string[];
  retryable?: boolean;
}

export class ErrorHandlerService {
  /**
   * Create standardized error response
   */
  createErrorResponse(
    message: string,
    code: ErrorCode,
    context?: any,
    originalError?: Error
  ): any {
    const errorDetails = this.analyzeError(message, code, originalError);
    
    return {
      status: 'error',
      message: errorDetails.userMessage,
      error: {
        code: errorDetails.code,
        details: this.sanitizeErrorMessage(errorDetails.details),
        suggestions: errorDetails.suggestions,
        retryable: errorDetails.retryable
      },
      timestamp: new Date().toISOString(),
      context: context ? {
        tool: context.toolName,
        args: this.sanitizeArgs(context.args)
      } : undefined
    };
  }

  /**
   * Analyze error and provide user-friendly information
   */
  private analyzeError(
    message: string,
    code: ErrorCode,
    originalError?: Error
  ): {
    userMessage: string;
    code: ErrorCode;
    details: string;
    suggestions: string[];
    retryable: boolean;
  } {
    const analysis = this.getErrorAnalysis(code, message, originalError);
    
    return {
      userMessage: analysis.userMessage,
      code,
      details: message,
      suggestions: analysis.suggestions,
      retryable: analysis.retryable
    };
  }

  /**
   * Get error analysis based on error code
   */
  private getErrorAnalysis(
    code: ErrorCode,
    message: string,
    originalError?: Error
  ): {
    userMessage: string;
    suggestions: string[];
    retryable: boolean;
  } {
    switch (code) {
      case 'TOOL_NOT_FOUND':
        return {
          userMessage: 'The requested tool is not available.',
          suggestions: [
            'Check available tools using the list tools command',
            'Verify the tool name is spelled correctly'
          ],
          retryable: false
        };

      case 'CONFIG_MISSING':
        return {
          userMessage: 'Affise API configuration is missing.',
          suggestions: [
            'Check that AFFISE_BASE_URL and AFFISE_API_KEY environment variables are set',
            'Verify your API credentials are correct',
            'Try running the status check tool first'
          ],
          retryable: false
        };

      case 'VALIDATION_ERROR':
        return {
          userMessage: 'Invalid input parameters provided.',
          suggestions: [
            'Check the required parameters for this tool',
            'Verify parameter types and formats',
            'See documentation for parameter examples'
          ],
          retryable: false
        };

      case 'AUTHENTICATION_ERROR':
        return {
          userMessage: 'Failed to authenticate with Affise API.',
          suggestions: [
            'Verify your API key is correct',
            'Check if your API key has the required permissions',
            'Ensure your API key hasn\'t expired'
          ],
          retryable: false
        };

      case 'RATE_LIMIT_ERROR':
        return {
          userMessage: 'API rate limit exceeded.',
          suggestions: [
            'Wait a moment before making another request',
            'Consider reducing the frequency of your requests',
            'Contact your Affise administrator about rate limits'
          ],
          retryable: true
        };

      case 'TIMEOUT_ERROR':
        return {
          userMessage: 'Request timed out.',
          suggestions: [
            'Try the request again',
            'Check your network connection',
            'Consider reducing the scope of your request'
          ],
          retryable: true
        };

      case 'NETWORK_ERROR':
        return {
          userMessage: 'Network connection failed.',
          suggestions: [
            'Check your internet connection',
            'Verify the Affise API URL is correct',
            'Try again in a few moments'
          ],
          retryable: true
        };

      case 'API_ERROR':
        return {
          userMessage: 'Affise API returned an error.',
          suggestions: [
            'Check the Affise API status',
            'Verify your request parameters',
            'Try the request again'
          ],
          retryable: true
        };

      case 'SEARCH_ERROR':
        return {
          userMessage: 'Search operation failed.',
          suggestions: [
            'Try simplifying your search query',
            'Check if the search terms are valid',
            'Verify the search parameters'
          ],
          retryable: true
        };

      case 'STATS_ERROR':
        return {
          userMessage: 'Failed to retrieve statistics.',
          suggestions: [
            'Check your date range parameters',
            'Verify the requested metrics are available',
            'Try a shorter time period'
          ],
          retryable: true
        };

      default:
        return {
          userMessage: 'An unexpected error occurred.',
          suggestions: [
            'Try the request again',
            'Check your input parameters',
            'Contact support if the problem persists'
          ],
          retryable: true
        };
    }
  }

  /**
   * Sanitize error message to remove sensitive information
   */
  sanitizeErrorMessage(message: string): string {
    if (!message || typeof message !== 'string') {
      return '';
    }

    // Patterns to redact sensitive information
    const sensitivePatterns = [
      // API keys (various formats)
      /api[_-]?key[=:\s]+[a-zA-Z0-9]{16,}/gi,
      /bearer\s+[a-zA-Z0-9]{16,}/gi,
      /token[=:\s]+[a-zA-Z0-9]{16,}/gi,
      
      // URLs with credentials
      /https?:\/\/[^@\s]+:[^@\s]+@[^\s]+/gi,
      
      // File paths (potentially expose system info)
      /\/[a-zA-Z0-9_\-\. \/]+\.(js|ts|json|env)/gi,
      
      // IP addresses
      /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
      
      // Database connection strings
      /(?:mongodb|mysql|postgres|redis):\/\/[^\s]+/gi,
      
      // Email addresses
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

      // Credit card numbers
      /\b(?:\d[ -]*?){13,16}\b/g,

      // Phone numbers
      /\+?[1-9]\d{1,14}(\s*x\d+)?/g,
      
      // Stack trace file paths
      /at\s+.*?\s+\([^)]*\)/gi,
      
      // Environment variable values
      /[A-Z_]+=[^\s]+/g
    ];

    let sanitized = message;
    
    // Apply redaction patterns
    for (const pattern of sensitivePatterns) {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    }

    // Remove common sensitive keywords and their values
    const sensitiveKeywords = [
      'password', 'secret', 'key', 'token', 'auth', 'credential',
      'api_key', 'apikey', 'access_token', 'refresh_token'
    ];

    for (const keyword of sensitiveKeywords) {
      // Remove key-value pairs
      const keyValuePattern = new RegExp(`${keyword}[=:\\s]+[^\\s,}]+`, 'gi');
      sanitized = sanitized.replace(keyValuePattern, `${keyword}=[REDACTED]`);
    }

    // If error is too generic or empty, provide a safe default
    if (!sanitized || sanitized.length < 5 || sanitized === '[REDACTED]') {
      return 'An error occurred while processing your request';
    }

    return sanitized;
  }

  /**
   * Sanitize arguments for error context (remove sensitive data)
   */
  private sanitizeArgs(args: any): any {
    if (!args || typeof args !== 'object') {
      return args;
    }

    const sanitized = { ...args };
    
    // Remove sensitive fields
    const sensitiveFields = [
      'api_key', 'apiKey', 'token', 'password', 'secret', 'auth', 'authorization',
      'access_token', 'refresh_token', 'client_secret', 'private_key',
      'AFFISE_API_KEY', 'AFFISE_BASE_URL'
    ];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = this.sanitizeArgs(sanitized[key]);
      }
      // Sanitize string values that might contain sensitive info
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.sanitizeErrorMessage(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(error: ErrorDetails): boolean {
    const retryableCodes: ErrorCode[] = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'RATE_LIMIT_ERROR',
      'API_ERROR'
    ];
    
    return retryableCodes.includes(error.code);
  }
}

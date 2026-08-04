/**
 * Error Handler Service - Centralized error handling with user-friendly messages
 */

export type ErrorCode = 
  | 'TOOL_NOT_FOUND'
  | 'CONFIG_MISSING'
  | 'VALIDATION_ERROR'
  | 'SEARCH_ERROR'
  | 'STATS_ERROR'
  | 'CONVERSIONS_ERROR'
  | 'CATEGORIES_ERROR'
  | 'TRAFFICBACK_ERROR'
  | 'TRACKING_LINK_ERROR'
  | 'OFFER_LOOKUP_ERROR'
  | 'PARTNER_LOOKUP_ERROR'
  | 'ADVERTISER_LOOKUP_ERROR'
  | 'RETENTION_ERROR'
  | 'TIME_TO_ACTION_ERROR'
  | 'CONVERSION_LOOKUP_ERROR'
  | 'PARTNER_API_ERROR'
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
    _message: string,
    _originalError?: Error
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

      case 'PARTNER_API_ERROR':
      case 'PARTNER_LOOKUP_ERROR':
        // Pass through the tool's own message — the tools build precise
        // hints like "Partner (affiliate) API key required — admin keys
        // do not have access to /3.1/partner/me" that the LLM needs verbatim.
        return {
          userMessage: _message || 'Partner API error.',
          suggestions: [
            'Ensure you are using a partner-role API key (not an admin key) for /3.1/partner/* and /3.0/partner/* endpoints',
            'Check the partner endpoint URL is correct',
            'Verify the partner has access to the requested data'
          ],
          retryable: false
        };

      case 'ADVERTISER_LOOKUP_ERROR':
      case 'CONVERSION_LOOKUP_ERROR':
      case 'RETENTION_ERROR':
      case 'TIME_TO_ACTION_ERROR':
        return {
          userMessage: _message || 'Affise API error.',
          suggestions: ['Verify the entity ID exists', 'Check your API key role'],
          retryable: false
        };

      default:
        // Preserve the tool's own message when present — the original was
        // chosen by the tool author for clarity. Fall back to generic if empty.
        return {
          userMessage: _message || 'An unexpected error occurred.',
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
      /bearer\s+[^\s,}"]+/gi,
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

      // Phone numbers — a plausible phone SHAPE only: an international
      // `+` form, or a separated 3-3-4 group. The old `\+?[1-9]\d{1,14}`
      // matched every bare 2-16 digit number, so it redacted affiliate ids
      // ("Ambiguous partner: id=325" → "id=[REDACTED]"), row counts, dates
      // ("2026-07-08" → "[REDACTED]-07-08") and the digits inside our own
      // guidance ("last 30 days" → "last [REDACTED] days").
      /\+\d[\d\s().-]{6,}\d(\s*x\d+)?/g,
      /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b(\s*x\d+)?/g,
      
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

    // Remove sensitive keyword=value or keyword: value assignments.
    // Whitespace alone after a keyword (`key required`, `auth checks`) is
    // legitimate English and must NOT trigger redaction — require an
    // explicit `=` or `:` separator. Optional whitespace after the
    // separator is fine (e.g. `Authorization: Bearer xxx`).
    // These carry the redaction on their own now: until the over-broad phone
    // rule above was narrowed, secrets like `key: abc123-secret-key-xyz789`
    // survived every dedicated pattern and only looked redacted because the
    // digits inside them were being mangled.
    const sensitiveKeywords = [
      'password', 'secret', 'token', 'authorization', 'auth', 'credential',
      'api_key', 'api-key', 'apikey', 'access_token', 'refresh_token',
      'private_key', 'privatekey', 'key'
    ];

    for (const keyword of sensitiveKeywords) {
      const keyValuePattern = new RegExp(
        `\\b${keyword}"?\\s*[=:]\\s*"?(?:bearer\\s+)?[^\\s,}"]+`,
        'gi',
      );
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
      // Sanitize primitive string values (e.g. an array element) for embedded
      // secrets, but preserve benign short/numeric values verbatim.
      return typeof args === 'string' ? this.sanitizeArgValue(args) : args;
    }

    // Preserve arrays as arrays — spreading an array into {...} turns it into a
    // numeric-keyed object, which corrupts the echoed args (e.g. ["os"] becomes
    // {0:"os"}). Recurse element-wise instead.
    if (Array.isArray(args)) {
      return args.map((el) => this.sanitizeArgs(el));
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

    // Recursively sanitize nested objects/arrays and string values
    for (const key in sanitized) {
      if (sensitiveFields.includes(key)) continue; // already redacted
      if (sanitized[key] !== null && typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeArgs(sanitized[key]);
      } else if (typeof sanitized[key] === 'string') {
        sanitized[key] = this.sanitizeArgValue(sanitized[key]);
      }
    }

    return sanitized;
  }

  /**
   * Sanitize an individual argument *value* (not a free-text error message).
   *
   * Unlike sanitizeErrorMessage(), this only strips high-confidence secrets and
   * PII embedded in the value. It deliberately omits the message-oriented rules
   * that corrupt legitimate arg values: the `length < 5 → generic placeholder`
   * fallback (which nuked "os", "cr", "hold") and the broad phone-number regex
   * (which redacted numeric IDs like "394" and the year in "2026-06-07").
   */
  private sanitizeArgValue(value: string): string {
    if (!value || typeof value !== 'string') {
      return value;
    }

    const secretPatterns: RegExp[] = [
      // API keys / bearer / token assignments
      /api[_-]?key[=:\s]+[a-zA-Z0-9]{16,}/gi,
      /bearer\s+[a-zA-Z0-9]{16,}/gi,
      /token[=:\s]+[a-zA-Z0-9]{16,}/gi,
      // URLs with embedded credentials
      /https?:\/\/[^@\s]+:[^@\s]+@[^\s]+/gi,
      // Database connection strings
      /(?:mongodb|mysql|postgres|redis):\/\/[^\s]+/gi,
      // Email addresses (PII)
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      // Credit card numbers
      /\b(?:\d[ -]*?){13,16}\b/g,
    ];

    let out = value;
    for (const pattern of secretPatterns) {
      out = out.replace(pattern, '[REDACTED]');
    }
    return out;
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

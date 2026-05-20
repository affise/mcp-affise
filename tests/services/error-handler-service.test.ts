/**
 * Tests for ErrorHandlerService
 */

import { ErrorHandlerService } from '../../src/services/error-handler-service.js';

describe('ErrorHandlerService', () => {
  let errorHandler: ErrorHandlerService;

  beforeEach(() => {
    errorHandler = new ErrorHandlerService();
  });

  describe('sanitizeErrorMessage', () => {
    it('should remove API keys from error messages', () => {
      const message = 'API request failed with key: abc123-secret-key-xyz789';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('abc123-secret-key-xyz789');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove URLs with credentials', () => {
      const message = 'Failed to connect to https://user:pass@api.example.com/endpoint';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('user:pass');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove sensitive headers', () => {
      const message = 'Request failed: Authorization: Bearer token123, X-API-Key: secret456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('token123');
      expect(sanitized).not.toContain('secret456');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove email addresses', () => {
      const message = 'User error for user@example.com with details';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('user@example.com');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove credit card numbers', () => {
      const message = 'Payment failed for card 4532-1234-5678-9012';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('4532-1234-5678-9012');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove phone numbers', () => {
      const message = 'SMS failed to +1-555-123-4567';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('+1-555-123-4567');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should handle empty or null messages', () => {
      expect(errorHandler.sanitizeErrorMessage('')).toBe('');
      expect(errorHandler.sanitizeErrorMessage(null as any)).toBe('');
      expect(errorHandler.sanitizeErrorMessage(undefined as any)).toBe('');
    });

    it('should preserve non-sensitive parts of the message', () => {
      const message = 'Network timeout occurred while connecting to API endpoint';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).toBe(message); // Should be unchanged
    });

    it('should handle multiple sensitive patterns in one message', () => {
      const message = 'User john@example.com failed with API key: abc123def456ghi789jkl and card 4111-1111-1111-1111';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('abc123def456ghi789jkl');
      expect(sanitized).not.toContain('4111-1111-1111-1111');
      expect((sanitized.match(/\[REDACTED\]/g) || []).length).toBeGreaterThanOrEqual(3);
    });

    it('regression: "API key required" is English text, NOT a secret to redact', () => {
      // Prior implementation matched `key[=:\s]+[^\s,}]+` which turned
      // "Partner API key required - admin keys do not have access" into
      // "Partner API key=[REDACTED] - admin keys do not have access",
      // destroying the diagnostic. The fix: require `=` or `:` after the
      // keyword, not whitespace.
      const message = 'Partner (affiliate) API key required - admin keys do not have access to /3.1/partner/me';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('key required');
      expect(sanitized).toContain('admin keys do not have access');
      expect(sanitized).not.toContain('[REDACTED]');
    });

    it('regression: "auth checks failed" is English text, NOT a token to redact', () => {
      const message = 'Pre-flight auth checks failed before request was sent';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toBe(message);
    });
  });

  describe('createErrorResponse', () => {
    it('should create McpError with sanitized message', () => {
      const originalError = new Error('Failed with API key: secret123');
      const mcpError = errorHandler.createErrorResponse(originalError.message, 'UNKNOWN_ERROR', {}, originalError);
      
      expect(mcpError.error.code).toBe('UNKNOWN_ERROR');
      expect(mcpError.error.details).not.toContain('secret123');
      expect(mcpError.error.details).toContain('[REDACTED]');
    });

    it('should preserve error code', () => {
      const originalError = new Error('Test error');
      const mcpError = errorHandler.createErrorResponse(originalError.message, 'STATS_ERROR', {}, originalError);
      
      expect(mcpError.error.code).toBe('STATS_ERROR');
    });

    it('should handle non-Error objects', () => {
      const mcpError = errorHandler.createErrorResponse('String error', 'VALIDATION_ERROR');
      
      expect(mcpError.error.code).toBe('VALIDATION_ERROR');
      expect(mcpError.error.details).toBe('String error');
    });

    it('should handle null/undefined errors', () => {
      const mcpError = errorHandler.createErrorResponse('Unknown error occurred', 'UNKNOWN_ERROR');

      expect(mcpError.error.code).toBe('UNKNOWN_ERROR');
      expect(mcpError.error.details).toBe('Unknown error occurred');
    });

    it('regression: PARTNER_API_ERROR surfaces the tool\'s own message, not generic fallback', () => {
      // The 6 partner_* tools emit precise hints like "Partner API key
      // required — admin keys do not have access to ...". Prior to fix
      // these were swallowed and replaced with "An unexpected error occurred."
      const toolMsg = 'Partner (affiliate) API key required - admin keys do not have access to /3.1/partner/me';
      const mcpError = errorHandler.createErrorResponse(toolMsg, 'PARTNER_API_ERROR', { toolName: 'affise_partner_profile' });

      expect(mcpError.message).toBe(toolMsg);
      expect(mcpError.message).not.toBe('An unexpected error occurred.');
      expect(mcpError.error.code).toBe('PARTNER_API_ERROR');
      expect(mcpError.error.retryable).toBe(false);
    });

    it('default code preserves tool message instead of replacing with generic', () => {
      const toolMsg = 'Specific tool failure with details X, Y, Z';
      const mcpError = errorHandler.createErrorResponse(toolMsg, 'UNKNOWN_ERROR');
      expect(mcpError.message).toBe(toolMsg);
    });
  });

  
});
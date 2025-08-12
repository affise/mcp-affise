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
      const message = 'User john@example.com failed with API key abc123 and card 4111-1111-1111-1111';
      const sanitized = errorHandler.sanitizeErrorMessage(message);
      
      expect(sanitized).not.toContain('john@example.com');
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).not.toContain('4111-1111-1111-1111');
      expect((sanitized.match(/\[REDACTED\]/g) || []).length).toBe(3);
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
  });

  
});
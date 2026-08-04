/**
 * Unit tests for ErrorHandlerService sanitization
 * Tests credential removal, URL cleaning, and sensitive pattern masking
 */

import { ErrorHandlerService } from '../../src/services/error-handler-service.js';

describe('ErrorHandlerService Sanitization', () => {
  let errorHandler: ErrorHandlerService;

  beforeEach(() => {
    errorHandler = new ErrorHandlerService();
  });

  describe('API key removal from error messages', () => {
    it('should remove api_key from error message', () => {
      const message = 'Failed to connect with api_key=abc123def456ghi789';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('abc123def456ghi789');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove API key with equals sign', () => {
      const message = 'Error: API_KEY=sk-1234567890abcdefghijklmnop';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('sk-1234567890abcdefghijklmnop');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove API key with colon separator', () => {
      const message = 'Authentication failed: api-key: xyzabc1234567890';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('xyzabc1234567890');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove multiple API keys', () => {
      const message = 'Keys: api_key=key1234567890123 and apikey=key9876543210987';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('key1234567890123');
      expect(sanitized).not.toContain('key9876543210987');
      expect(sanitized.match(/\[REDACTED\]/g)).not.toBeNull();
    });

    it('should remove Bearer tokens', () => {
      const message = 'Authorization failed: Bearer abcdef1234567890ghijklmnop';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('abcdef1234567890ghijklmnop');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove token values', () => {
      const message = 'Invalid token=1a2b3c4d5e6f7g8h9i0j';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('1a2b3c4d5e6f7g8h9i0j');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('URL credential removal', () => {
    it('should remove credentials from HTTP URLs', () => {
      const message = 'Failed to connect to http://user:password@example.com/api';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('user:password');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove credentials from HTTPS URLs', () => {
      const message = 'Error at https://admin:secret123@api.example.com';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('admin:secret123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove credentials from multiple URLs', () => {
      const message = 'Tried http://user1:pass1@host1.com and https://user2:pass2@host2.com';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('user1:pass1');
      expect(sanitized).not.toContain('user2:pass2');
    });

    it('should remove database connection strings', () => {
      const message = 'Database error: mongodb://admin:secret@localhost:27017/db';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('admin:secret');
    });

    it('should remove PostgreSQL connection strings', () => {
      const message = 'Connection failed: postgres://user:password@hostname:5432/dbname';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('user:password');
    });

    it('should remove MySQL connection strings', () => {
      const message = 'MySQL error: mysql://root:secretpwd@localhost:3306/mydb';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('root:secretpwd');
    });
  });

  describe('Authorization header removal', () => {
    it('should remove Bearer authorization headers', () => {
      const message = 'Request headers: Authorization: Bearer sk-abc123def456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('sk-abc123def456');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove token from authorization header', () => {
      const message = 'Header contains: token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Generic error fallback', () => {
    it('should handle empty string', () => {
      const message = '';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toBe('');
    });

    it('should handle null input', () => {
      const sanitized = errorHandler.sanitizeErrorMessage(null as any);

      expect(sanitized).toBe('');
    });

    it('should handle undefined input', () => {
      const sanitized = errorHandler.sanitizeErrorMessage(undefined as any);

      expect(sanitized).toBe('');
    });

    it('should handle non-string input', () => {
      const sanitized = errorHandler.sanitizeErrorMessage(123 as any);

      expect(sanitized).toBe('');
    });

    it('redacts phone numbers that actually look like phone numbers', () => {
      expect(errorHandler.sanitizeErrorMessage('Contact +1 415 555 2671 for access'))
        .toBe('Contact [REDACTED] for access');
      expect(errorHandler.sanitizeErrorMessage('Escalate to 415-555-2671 please'))
        .toBe('Escalate to [REDACTED] please');
    });

    it('keeps plain numbers, ids and dates in error messages intact', () => {
      // The old `\+?[1-9]\d{1,14}` pattern matched every bare 2-16 digit run, so
      // affiliate ids, counts and the digits inside our own guidance were lost.
      expect(errorHandler.sanitizeErrorMessage('Connection timeout after 30 seconds'))
        .toBe('Connection timeout after 30 seconds');
      expect(errorHandler.sanitizeErrorMessage('Ambiguous partner "acme": 5 matches — id=325, id=999'))
        .toBe('Ambiguous partner "acme": 5 matches — id=325, id=999');
      expect(errorHandler.sanitizeErrorMessage('Use a named period (today, last 7 days, last 30 days)'))
        .toBe('Use a named period (today, last 7 days, last 30 days)');
      expect(errorHandler.sanitizeErrorMessage('Could not parse the date "28 july"'))
        .toBe('Could not parse the date "28 july"');
      expect(errorHandler.sanitizeErrorMessage('Range 2026-07-08..2026-07-14: request failed'))
        .toBe('Range 2026-07-08..2026-07-14: request failed');
    });

    it('should keep error messages without sensitive data', () => {
      const message = 'Failed to parse JSON response';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toBe(message);
    });
  });

  describe('Environment variable sanitization', () => {
    it('should remove environment variable assignments', () => {
      const message = 'Config includes API_KEY=secretvalue123';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('secretvalue123');
    });

    it('should remove multiple environment variables', () => {
      const message = 'Env: DB_PASSWORD=pass123 and API_TOKEN=token456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('pass123');
      expect(sanitized).not.toContain('token456');
    });
  });

  describe('Sensitive keyword sanitization', () => {
    it('should remove password values', () => {
      const message = 'Login failed with password=mySecretPassword123';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('password=[REDACTED]');
      expect(sanitized).not.toContain('mySecretPassword123');
    });

    it('should remove secret values', () => {
      const message = 'Invalid secret: abc123secret';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove key values', () => {
      const message = 'Missing key: privateKey123456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove credential values', () => {
      const message = 'credential=user:pass';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('credential=[REDACTED]');
    });

    it('should remove access_token values', () => {
      const message = 'Using access_token: at_abc123def456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
    });

    it('should remove refresh_token values', () => {
      const message = 'refresh_token=rt_xyz789abc012';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('refresh_token=[REDACTED]');
    });
  });

  describe('File path sanitization', () => {
    it('should remove file paths with .js extension', () => {
      const message = 'Error in /usr/local/app/src/api/server.js:42';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('/usr/local/app/src/api/server.js');
    });

    it('should remove file paths with .ts extension', () => {
      const message = 'Type error in /home/user/project/handlers/auth.ts';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('handlers/auth.ts');
    });

    it('should remove .env file references', () => {
      const message = 'Failed to load /app/config/.env.production';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('.env.production');
    });
  });

  describe('IP address sanitization', () => {
    it('should remove IPv4 addresses', () => {
      const message = 'Connection refused from 192.168.1.100';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('192.168.1.100');
    });

    it('should remove multiple IP addresses', () => {
      const message = 'Traffic between 10.0.0.1 and 172.16.0.1';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('10.0.0.1');
      expect(sanitized).not.toContain('172.16.0.1');
    });
  });

  describe('Email address sanitization', () => {
    it('should remove email addresses', () => {
      const message = 'Notification sent to user@example.com';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('user@example.com');
    });

    it('should remove multiple email addresses', () => {
      const message = 'CC: admin@site.com, support@site.com';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('admin@site.com');
      expect(sanitized).not.toContain('support@site.com');
    });
  });

  describe('Stack trace sanitization', () => {
    it('should remove stack trace file paths', () => {
      const message = 'Error\n    at Function.Module (internal/modules/cjs/loader.js:883:14)';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
    });

    it('should handle multi-line stack traces', () => {
      const message = `TypeError: Cannot read property
    at Object.<anonymous> (/app/src/handler.ts:45:10)
    at Module._compile (internal/modules/cjs/loader.js:1137:30)`;
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Complex real-world scenarios', () => {
    it('should sanitize error with multiple sensitive patterns', () => {
      const message = `Authentication failed:
        API_KEY=sk-abc123
        URL: https://admin:secret@api.example.com
        Token: Bearer xyz789
        From IP: 192.168.1.50`;

      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('sk-abc123');
      expect(sanitized).not.toContain('admin:secret');
      expect(sanitized).not.toContain('xyz789');
      expect(sanitized).not.toContain('192.168.1.50');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should preserve error context while removing credentials', () => {
      // Use api_key=<long-hex>. The bare word "key" was removed from the
      // sensitive-keyword list to stop false positives in English text
      // ("Partner API key required" used to become "Partner API key=[REDACTED]").
      const message = 'Failed to connect to API with api_key=abc123def456ghi789jkl';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      // Context survives.
      expect(sanitized).toContain('Failed to connect to API');
      // Secret value is gone.
      expect(sanitized).not.toContain('abc123def456ghi789jkl');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should handle JSON-like error messages', () => {
      const message = '{"error": "Auth failed", "api_key": "secret123", "status": 401}';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      // The sanitizer aggressively removes sensitive keywords and patterns
      expect(sanitized).toContain('"error"');
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).toContain('api_key'); // Key name preserved but value redacted
    });

    it('should handle error messages with AFFISE_API_KEY', () => {
      const message = 'Affise request failed: AFFISE_API_KEY=affise_secret_key_12345';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('affise_secret_key_12345');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('should handle error messages with REMOTE_MCP_TOKEN', () => {
      const message = 'Token validation failed for REMOTE_MCP_TOKEN=mcp_token_xyz789abc';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('mcp_token_xyz789abc');
      expect(sanitized).toContain('[REDACTED]');
    });
  });

  describe('Case sensitivity and formatting', () => {
    it('should handle uppercase environment variables', () => {
      const message = 'Error: API_KEY=SECRET123 DATABASE_URL=mysql://user:pass@host';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('SECRET123');
      expect(sanitized).not.toContain('user:pass');
    });

    it('should handle mixed case patterns', () => {
      const message = 'Failed with ApiKey=test123 and api_KEY=test456';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('test123');
    });

    it('should sanitize while maintaining some error context', () => {
      const message = 'Error code: 401, reason: invalid token=abc123, please check credentials';
      const sanitized = errorHandler.sanitizeErrorMessage(message);

      // The sanitizer may redact numbers that look like patterns
      expect(sanitized).toContain('Error code:');
      expect(sanitized).toContain('reason:');
      expect(sanitized).toContain('please check credentials');
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).toContain('token=[REDACTED]');
    });
  });
});

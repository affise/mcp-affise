/**
 * Minimal no-op security logger for the stdio public build.
 *
 * The internal HTTP server uses a fuller implementation that persists events
 * to disk and dispatches Slack alerts. In stdio mode (single-user, single-
 * process, no shared infrastructure) suspicious-input events are emitted to
 * stderr in development only — no persistence, no outbound network calls.
 */

interface SuspiciousInputEvent {
  field: string;
  attackVectors: string[];
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

class NoopSecurityLogger {
  async logSuspiciousInput(event: SuspiciousInputEvent): Promise<void> {
    if (process.env.NODE_ENV === 'development' && event.threatLevel !== 'none') {
      console.error(
        `[security] suspicious input on "${event.field}" (level=${event.threatLevel}, vectors=${event.attackVectors.join(',') || 'none'})`
      );
    }
  }
}

export const securityLogger = new NoopSecurityLogger();

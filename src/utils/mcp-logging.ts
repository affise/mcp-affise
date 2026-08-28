/**
 * Thin wrapper around `Server.sendLoggingMessage` that never throws.
 *
 * MCP spec 2025-06-18 lets servers declare `capabilities.logging = {}` and
 * push log events to the client via `notifications/message`. The SDK's
 * `sendLoggingMessage()` is the API for that, but it requires the server
 * to already be connected to a transport — calling it before `connect()`
 * or after `close()` throws.
 *
 * Here we soft-wrap so callers can sprinkle log lines without worrying about
 * the lifecycle. Failures (transport not ready, client doesn't honour
 * `logging/setLevel`, etc.) fall back to a `console.*` no-op and are
 * swallowed.
 */

import type { McpServer } from '../mcp-sdk.js';

export type LogLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

interface LogPayload {
  level: LogLevel;
  /** Component identifier, free-form. Helps clients filter by source. */
  logger?: string;
  /** Structured payload — JSON-serializable. */
  data: unknown;
}

/**
 * Send a log message to the connected MCP client. Drops silently if the
 * server isn't connected yet or the client doesn't subscribe to logs.
 *
 * Accepts the high-level `McpServer` and pulls the low-level transport
 * surface (`.server.sendLoggingMessage`) inside — Phase 1 Step 3 narrowed
 * the public-facing type to `McpServer` and dropped the `Server` re-export.
 *
 * In dev (`NODE_ENV !== 'production'`) the same line is also mirrored to
 * stderr so it's visible when running through Claude Desktop / curl.
 */
export function mcpLog(mcpServer: McpServer, payload: LogPayload): void {
  const fallback = () => {
    if (process.env.NODE_ENV !== 'production') {
      const tag = payload.logger ? `[${payload.logger}]` : '';
      // eslint-disable-next-line no-console
      console.error(`[mcp:${payload.level}]${tag}`, payload.data);
    }
  };
  try {
    // sendLoggingMessage is async and rejects when no transport is connected.
    // Swallow both sync throws and async rejections so callers can sprinkle
    // log lines during boot / shutdown without crashing the process.
    const maybePromise = mcpServer.server.sendLoggingMessage({
      level: payload.level,
      logger: payload.logger,
      data: payload.data,
    });
    if (maybePromise && typeof (maybePromise as Promise<unknown>).catch === 'function') {
      (maybePromise as Promise<unknown>).catch(fallback);
    }
  } catch {
    fallback();
  }
}

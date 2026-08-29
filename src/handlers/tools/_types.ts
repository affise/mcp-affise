/**
 * Shared types for per-tool handler functions.
 *
 * Tier 5.4 split the EnhancedToolHandler.handle* methods into free functions
 * grouped by Affise API area (nl, admin-analytics, conversions, admin-entities,
 * partner). Every handler now has a uniform signature and receives explicit
 * deps instead of pulling them off `this.*` on the orchestrator class.
 */

import type { ErrorHandlerService } from '../../services/error-handler-service.js';
import type { ValidationService } from '../../services/validation-service.js';

export type AffiseConfig =
  | {
      baseUrl: string;
      apiKey: string;
      /**
       * Caller's Affise role. Never set on this stdio distribution, which
       * resolves credentials from config only; the field exists so the
       * handler signatures stay identical to the internal server's.
       */
      role?: 'admin' | 'partner' | 'advertiser' | 'unknown';
      /**
       * Session id for a credential store that can be rotated at runtime.
       * Always undefined on this stdio distribution; kept for signature
       * parity with the internal server.
       */
      sessionId?: string;
    }
  | null
  | undefined;

/**
 * Service deps every handler needs.
 * The orchestrator (EnhancedToolHandler) builds one of these and threads it
 * through every dispatch.
 */
export interface HandlerDeps {
  errorHandler: ErrorHandlerService;
  validator: ValidationService;
}

/**
 * Uniform handler signature.
 *
 * `config` is the *resolved* credential pair — the orchestrator picks
 * `sessionConfig ?? staticConfig` before calling. Handlers still validate
 * `config.baseUrl && config.apiKey` for safety because some entry points
 * (affise_status especially) can be called without any creds at all.
 */
export type ToolHandler = (
  args: any,
  config: AffiseConfig,
  deps: HandlerDeps
) => Promise<any>;

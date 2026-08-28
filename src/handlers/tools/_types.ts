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
       * Caller's Affise role when the resolved creds came from an OAuth /
       * JWT session (NOT set for the static-token path or stdio config).
       * Most handlers ignore this; the auth tool reports it back to the
       * widget.
       */
      role?: 'admin' | 'partner' | 'advertiser' | 'unknown';
      /**
       * Encrypted-session id when the creds came from an OAuth / JWT
       * session. Lets the auth tool rotate stored creds for that session
       * after re-validation. Undefined on static-token / stdio paths.
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

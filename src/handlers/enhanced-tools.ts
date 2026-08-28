/**
 * Tool dispatch orchestrator.
 *
 * Before Tier 5.4 this file was 1638 LOC: the EnhancedToolHandler class held
 * 22 per-tool `handle*` methods PLUS the orchestration logic (cache, error
 * wrapping, registerTool wiring). Tier 5.4 extracted the per-tool bodies into
 * `src/handlers/tools/*` free functions; this file is now just:
 *
 *  - EnhancedToolHandler:  cache + dispatch into HANDLER_REGISTRY
 *  - setupEnhancedHandlers: per-tool mcpServer.registerTool() loop
 *
 * The dispatch contract stays identical from the call-site perspective —
 * `executeTool(name, args, userSession)` returns the same shape as before.
 */

import { createHash } from 'node:crypto';

import { McpServer } from '../mcp-sdk.js';
import { TOOL_SCHEMAS } from './tool-schemas.js';
import { HANDLER_REGISTRY, type HandlerDeps } from './tools/index.js';
import { mcpLog } from '../utils/mcp-logging.js';
import { makeProgressReporter } from '../utils/mcp-progress.js';
import { normalizeBaseUrl } from '../utils/url.js';

// Enhanced services
import { CacheService } from '../services/cache-service.js';
import { ErrorHandlerService } from '../services/error-handler-service.js';
import { ValidationService } from '../services/validation-service.js';

// All public Affise tools are read-only (no mutations to remote state).
// These annotations let MCP clients (Claude Desktop, Cursor, etc.) auto-approve
// read-only tools and skip "are you sure?" prompts for non-destructive calls.
// `openWorldHint: true` because data comes from an external Affise tenant.
const READ_ONLY_TOOL: {
  readOnlyHint: true;
  destructiveHint: false;
  idempotentHint: true;
  openWorldHint: true;
} = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

/**
 * Deterministic serialization for cache keys: object keys sorted at EVERY
 * nesting level, array order preserved.
 *
 * Do NOT go back to `JSON.stringify(args, Object.keys(args).sort())` — the
 * second argument is a property allowlist applied at every level, not a sort,
 * so nested `filter.partner` / `filter.sub2` / `filter.goal` were stripped and
 * two queries differing only by filter shared one cache key (and one result).
 */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * EnhancedToolHandler — cache + dispatch only.
 *
 * Per-tool logic lives in src/handlers/tools/*.ts. This class threads the
 * shared service deps (errorHandler, validator) through every dispatch and
 * adds cache + cache_info / performance envelope on top.
 */
export class EnhancedToolHandler {
  private cacheService: CacheService;
  private errorHandler: ErrorHandlerService;
  private validator: ValidationService;
  private deps: HandlerDeps;

  constructor(private config: { baseUrl: string; apiKey: string } | null) {
    this.cacheService = new CacheService({
      defaultTTL:      300000, // 5 minutes
      maxSize:         1000,
      cleanupInterval: 600000, // 10 minutes
    });
    this.errorHandler = new ErrorHandlerService();
    this.validator    = new ValidationService();

    // Bundle the dep object once; passed by reference to every handler call.
    this.deps = {
      errorHandler: this.errorHandler,
      validator:    this.validator,
    };
  }

  /**
   * Execute tool with cache + envelope additions.
   */
  async executeTool(
    toolName: string,
    args: any,
    userSession?: {
      baseUrl: string;
      apiKey: string;
      role?: 'admin' | 'partner' | 'advertiser' | 'unknown';
      sessionId?: string;
    },
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate tool exists
      if (!(toolName in TOOL_SCHEMAS)) {
        return this.errorHandler.createErrorResponse(
          `Unknown tool: ${toolName}`,
          'TOOL_NOT_FOUND',
          { toolName, args }
        );
      }

      // Use user session credentials if provided, otherwise fall back to static config.
      // Normalize baseUrl here — the single chokepoint every tool (SDK + WS path)
      // funnels through — so a trailing slash never reaches the string-concat URL
      // builders and turns into a 404 (`…com//3.0/...`). Covers env, static-token,
      // and already-stored OAuth sessions alike.
      // `apiKey` is re-read explicitly, not left to the spread: `this.config`
      // is a SecureConfigWrapper whose baseUrl/apiKey are prototype getters,
      // and object spread copies own enumerable properties only. Spreading
      // alone yields `{ secureConfig }` — baseUrl survives because it is
      // reassigned here, apiKey silently becomes undefined, and every
      // credential-using tool fails with "apiKey not provided". This package
      // is stdio-only, so that path is the only path.
      const rawConfig = userSession || this.config;
      const config = rawConfig
        ? {
            ...rawConfig,
            baseUrl: normalizeBaseUrl(rawConfig.baseUrl),
            apiKey: rawConfig.apiKey,
          }
        : rawConfig;

      // Validate configuration (except for status check)
      if (toolName !== 'affise_status' && !config) {
        return this.errorHandler.createErrorResponse(
          'Configuration not loaded',
          'CONFIG_MISSING',
          { toolName, args }
        );
      }

      // Cache check
      const cacheKey = this.generateCacheKey(toolName, args);
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        return {
          ...cachedResult,
          cache_info: {
            was_cached:        true,
            cache_key:         cacheKey,
            cache_performance: 'hit',
          },
        };
      }

      // Dispatch to per-tool handler via registry
      const handler = HANDLER_REGISTRY[toolName];
      if (!handler) {
        throw new Error(`Unknown tool: ${toolName}`);
      }
      const result = await handler(args, config, this.deps);

      // Cache successful results
      if (result?.status === 'ok') {
        const ttl = this.getCacheTTL(toolName);
        await this.cacheService.set(cacheKey, result, ttl);
      }

      // Add cache info and performance metrics
      const responseTime = Date.now() - startTime;
      return {
        ...result,
        cache_info: {
          was_cached:        false,
          cache_key:         cacheKey,
          cache_performance: 'miss',
        },
        performance: {
          response_time: responseTime,
          cache_stats:   this.cacheService.getStats(),
        },
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        error.message,
        'UNKNOWN_ERROR',
        { toolName, args },
        error
      );
    }
  }

  private generateCacheKey(toolName: string, args: any): string {
    return `${toolName}:${this.hashString(stableStringify(args))}`;
  }

  private getCacheTTL(toolName: string): number {
    const cacheTTLs: Record<string, number> = {
      affise_status:              60000,    // 1 min
      affise_offer_categories:    600000,   // 10 min
      affise_search_offers:       300000,   // 5 min
      affise_stats:               180000,   // 3 min
      affise_stats_raw:           180000,   // 3 min
      affise_stats_compare:       180000,   // 3 min — two custom-stats pulls
      affise_trafficback:         300000,   // 5 min
      affise_affiliate_analysis:  300000,   // 5 min — composite of stats + trafficback pulls
      affise_smart_search:        300000,   // 5 min
      affise_conversions_raw:     120000,   // 2 min — raw conversions are time-sensitive
      affise_offer_tracking_link: 600000,   // 10 min — deterministic per (offer, affiliate, sub*)
      // Entity lookups: details rarely change; lists may change more often.
      affise_get_offer:           600000,   // 10 min
      affise_list_partners:       180000,   // 3 min
      affise_get_partner:         600000,   // 10 min
      affise_list_advertisers:    180000,   // 3 min
      affise_get_advertiser:      600000,   // 10 min
      // Stats analytics — cohort & timing data is slow-changing.
      affise_retention_rate:      600000,   // 10 min
      affise_time_to_action:      300000,   // 5 min
      affise_get_conversion:      600000,   // 10 min — single conversion is immutable
      // Partner Phase A — change rates per endpoint.
      affise_partner_profile:     300000,   // 5 min
      affise_partner_balance:     60000,    // 1 min — ticks fast on activity
      affise_partner_offers:      600000,   // 10 min
      affise_partner_live_offers: 300000,   // 5 min
      affise_partner_find_subs:   60000,    // 1 min
      affise_partner_news:        1800000,  // 30 min
    };

    return cacheTTLs[toolName] || 300000; // Default 5 minutes
  }

  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  getMetrics(): any {
    return {
      cache:     this.cacheService.getStats(),
      timestamp: new Date().toISOString(),
    };
  }

  destroy(): void {
    this.cacheService.destroy();
  }
}

/**
 * Above this serialized size, a widget-backed tool result is too big to hand
 * to the model verbatim — the host offloads `content[].text` to a file and the
 * model is left grepping it. The full rows still reach the widget via
 * `structuredContent`, so for the text block we substitute a compact summary.
 * ~12 KB leaves comfortable headroom under typical inline-result budgets.
 */
const MODEL_TEXT_MAX_BYTES = 12_000;

/**
 * Locate the dominant collection in a tool result for summarization:
 *  - a compactTabular grid (`{columns, rows, ...}`) at the root or under `.data`
 *  - failing that, the first array found under `.data` (e.g. offers/conversions)
 */
function extractCollection(result: any): {
  grid?: { columns: any[]; rows: any[]; total?: number; page?: number; per_page?: number; dropped_columns?: string[] };
  array?: { key: string; items: any[] };
} {
  for (const root of [result, result?.data]) {
    if (root && Array.isArray(root.columns) && Array.isArray(root.rows)) {
      return { grid: root };
    }
  }
  const container = result?.data ?? result;
  if (container && typeof container === 'object') {
    for (const [key, val] of Object.entries(container)) {
      if (Array.isArray(val)) return { array: { key, items: val } };
    }
  }
  return {};
}

/**
 * Build the model-facing text for a tool result. Small payloads pass through
 * as full JSON. Large widget-backed payloads collapse to a summary (counts,
 * columns, pagination, a few sample rows) — the full data already rode along
 * in `structuredContent` for the widget, so nothing is lost to the UI.
 */
export function buildModelText(result: any, hasWidget: boolean): string {
  const full = JSON.stringify(result, null, 2);
  if (!hasWidget || Buffer.byteLength(full, 'utf8') <= MODEL_TEXT_MAX_BYTES) {
    return full;
  }

  const base = {
    status: result?.status,
    message: result?.message,
    metadata: result?.metadata,
    timestamp: result?.timestamp,
  };
  const { grid, array } = extractCollection(result);

  if (grid) {
    const total = grid.total ?? grid.rows.length;
    const sample = grid.rows.slice(0, 5);
    return JSON.stringify({
      ...base,
      summary: {
        returned_rows: grid.rows.length,
        total,
        page: grid.page,
        per_page: grid.per_page,
        columns: grid.columns,
        dropped_columns: grid.dropped_columns,
      },
      sample_rows: sample,
      note: `All ${total} rows are rendered in the widget. Only the first ${sample.length} are shown here to stay within context. To inspect specific rows in text, narrow with filters (search/status/manager) or request a smaller page/limit.`,
    }, null, 2);
  }

  if (array) {
    const sample = array.items.slice(0, 3);
    return JSON.stringify({
      ...base,
      summary: { collection: array.key, returned: array.items.length },
      sample_items: sample,
      note: `${array.items.length} ${array.key} rendered in the widget. Showing the first ${sample.length} here; narrow with filters to inspect specific entries in text.`,
    }, null, 2);
  }

  return JSON.stringify({
    ...base,
    note: 'Full result rendered in the widget; payload omitted from text to stay within context.',
  }, null, 2);
}

/**
 * Widget-paginated tools: their stats-grid widget fetches further pages on
 * demand via `app.callServerTool` (ext-apps), accumulating rows client-side.
 * Each page must stay under the host's widget-data budget AND the model
 * context. We give every such tool a default page size, and HARD-CAP the
 * ones whose rows are wide enough that a bigger page would overflow.
 *
 * Conversions are the exception: they are column-projected (~14 cols, see
 * affise_conversions DEFAULT_CONVERSION_FIELDS), so a row is light (~0.25 KB)
 * and we do NOT cap — a model can request up to the API max (1000) to build
 * an export in one call. Partners/advertisers keep all columns, so 100 rows
 * (~24 KB) is the safe ceiling and we cap there.
 */
const DEFAULT_WIDGET_PAGE_SIZE = 100;
const WIDGET_PAGE_SIZES: Record<string, number> = {
  affise_list_partners: 100,
  affise_list_advertisers: 100,
  affise_conversions_raw: 100,
  affise_trafficback: 100,
  affise_time_to_action: 100,
};
// Tools whose page size is a hard ceiling (vs. just a default the model may
// exceed). Conversions is intentionally absent — projection keeps it light.
const HARD_CAPPED_WIDGET_TOOLS = new Set<string>([
  'affise_list_partners',
  'affise_list_advertisers',
]);
function widgetPageSize(toolName: string): number | undefined {
  return WIDGET_PAGE_SIZES[toolName];
}

/**
 * Build the pagination cursor the widget needs to request the next page.
 * `ontoolinput` hands the widget the call arguments but NOT the tool name, so
 * the server names the tool here. Returns null when the result carries no
 * grid (error / empty) or there are no further pages.
 */
/**
 * Hosts reject (ChatGPT) or offload (Claude Desktop) tool results past a hard
 * ceiling — ChatGPT's is 1 MB, counting `content` + `structuredContent`
 * together. Stay comfortably under it: if a grid result is too big, drop
 * trailing rows to fit and tell the model how to get the rest (narrow columns
 * via `fields`, or page). Non-grid results pass through untouched (we can't
 * safely truncate an opaque payload). Mutates the grid in place so the trimmed
 * rows flow into both structuredContent and the model text.
 */
const SAFE_RESULT_BYTES = 800_000;

export function enforceResultSizeLimit(result: any, hasWidget: boolean): any {
  if (!hasWidget || !result || typeof result !== 'object') return result;
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') <= SAFE_RESULT_BYTES) return result;

  const { grid } = extractCollection(result);
  if (!grid || !Array.isArray(grid.rows) || grid.rows.length === 0) return result;

  const rowsBytes = Buffer.byteLength(JSON.stringify(grid.rows), 'utf8');
  const perRow = Math.max(1, Math.ceil(rowsBytes / grid.rows.length));
  const keep = Math.max(1, Math.floor((SAFE_RESULT_BYTES * 0.85) / perRow));
  if (keep >= grid.rows.length) return result;

  const total = grid.total ?? grid.rows.length;
  grid.rows = grid.rows.slice(0, keep);
  result.metadata = {
    ...(result.metadata ?? {}),
    truncated: {
      returned: keep,
      total,
      reason: 'result exceeded the host size limit',
      hint: 'Narrow columns with the `fields` parameter, or fetch more with `page`.',
    },
  };
  return result;
}

export function buildPaginationCursor(toolName: string, args: any, result: any): any | null {
  const { grid } = extractCollection(result);
  if (!grid) return null;
  const page = grid.page ?? args?.page ?? 1;
  const perPage = grid.per_page ?? widgetPageSize(toolName) ?? DEFAULT_WIDGET_PAGE_SIZE;
  const total = grid.total ?? grid.rows.length;
  return {
    tool: toolName,
    args: args ?? {},
    page,
    perPage,
    total,
    returned: grid.rows.length,
    hasMore: page * perPage < total,
  };
}

/**
 * Wire the catalogued tools onto an McpServer.
 *
 * Behaviour preserved from Tier 3.2–3.6:
 *  - logging capability via mcpLog on errors
 *  - progress notifications via makeProgressReporter
 *  - per-tool outputSchema → structuredContent (Tier 2.4)
 *  - per-tool _meta (Tier 3.1)
 */
export function setupEnhancedHandlers(
  mcpServer: McpServer,
  config: { baseUrl: string; apiKey: string } | null
): void {
  const toolHandler = new EnhancedToolHandler(config);

  for (const [name, def] of Object.entries(TOOL_SCHEMAS)) {
    const hasOutputSchema = 'outputSchema' in def && (def as any).outputSchema;
    const hasMeta = '_meta' in def && (def as any)._meta;

    mcpServer.registerTool(
      name,
      {
        title:       def.title,
        description: def.description,
        // Each tool has a different ZodRawShape; the union over all 23 shapes
        // isn't worth modelling, so we widen at the registration site only.
        inputSchema: def.inputSchema as any,
        ...(hasOutputSchema ? { outputSchema: (def as any).outputSchema } : {}),
        annotations: READ_ONLY_TOOL,
        ...(hasMeta ? { _meta: (def as any)._meta } : {}),
      },
      async (args: any, extra: any) => {
        const reportProgress = makeProgressReporter(extra);
        reportProgress(0, 1, 'fetching');
        try {
          // Widget-paginated tools: set a per-page so each page stays light
          // enough for the host to deliver to the widget (the widget pages
          // through the rest via callServerTool). Hard-capped tools clamp the
          // model's limit to the page size; the rest treat it as a default the
          // model may exceed (e.g. conversions export — projection keeps it
          // light). page defaults to 1.
          let effectiveArgs = args ?? {};
          const pageSize = widgetPageSize(name);
          if (pageSize) {
            const requested = Number(effectiveArgs.limit) || pageSize;
            const limit = HARD_CAPPED_WIDGET_TOOLS.has(name) ? Math.min(requested, pageSize) : requested;
            effectiveArgs = { ...effectiveArgs, limit, page: effectiveArgs.page ?? 1 };
          }
          let result = await toolHandler.executeTool(name, effectiveArgs);
          // Last-resort guard: never hand the host a result over its hard
          // ceiling (ChatGPT errors at 1 MB). Truncates rows + tells the model
          // how to recover (narrow `fields`, or page).
          result = enforceResultSizeLimit(result, hasOutputSchema);
          reportProgress(1, 1, 'done');
          // Full data always rides in structuredContent for the widget. The
          // model-facing text collapses to a summary when a widget-backed
          // result is too large to inline — otherwise the host offloads it to
          // a file and the model can't reason over it (see buildModelText).
          const response: any = {
            content: [{ type: 'text' as const, text: buildModelText(result, hasOutputSchema) }],
          };
          if (hasOutputSchema) {
            response.structuredContent = result;
          }
          // Pagination cursor for the widget's "load more" (ext-apps
          // callServerTool). Lives in result `_meta` because the widget's
          // ontoolinput sees the args but not the tool name.
          if (pageSize && result?.status === 'ok') {
            const cursor = buildPaginationCursor(name, effectiveArgs, result);
            if (cursor) response._meta = { ...(response._meta ?? {}), 'affise/pagination': cursor };
          }
          return response;
        } catch (error: any) {
          mcpLog(mcpServer, {
            level:  'error',
            logger: 'affise/tool',
            data: {
              event:   'tool_execution_failed',
              tool:    name,
              message: error?.message ?? String(error),
            },
          });
          // isError signals a tool-execution failure to the client and tells
          // the SDK to skip outputSchema validation for this response.
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                status:    'error',
                message:   `Unexpected error: ${error.message}`,
                timestamp: new Date().toISOString(),
              }, null, 2),
            }],
            isError: true,
          };
        }
      }
    );
  }
}

/**
 * Legacy compatibility
 */
export function setupSimpleHandlers(
  mcpServer: McpServer,
  config: { baseUrl: string; apiKey: string } | null
): void {
  setupEnhancedHandlers(mcpServer, config);
}

/**
 * Progress notification helper for `tools/call` handlers.
 *
 * MCP spec 2025-06-18: a client opts in to progress updates by sending
 * `_meta.progressToken` on the request. The server replies with
 * `notifications/progress` carrying the same token + `progress` / optional
 * `total`. Without the token, the server emits nothing.
 *
 * Most of our slow tools (`affise_conversions_raw`, `affise_stats_raw`,
 * `affise_list_partners`, ...) are a single black-box REST call from our
 * vantage point — we can't report per-record progress, but we *can*
 * surface coarse "started / received / done" milestones so the user
 * doesn't think the call hung.
 */

/**
 * Two context shapes reach this helper. SDK v1 handed handlers a flat
 * `{_meta, sendNotification}`; SDK v2 nests both under `mcpReq`
 * (`ctx.mcpReq._meta.progressToken` + `ctx.mcpReq.notify`). Both legs of
 * the dual-era `/mcp` endpoint build their server from the v2 packages, so
 * the v2 branch is the live one — the v1 fields stay supported because the
 * stdio path and the tests still exercise that shape.
 */
type ProgressExtra = {
  _meta?: { progressToken?: string | number };
  sendNotification?: (n: unknown) => Promise<void>;
  mcpReq?: {
    _meta?: { progressToken?: string | number };
    notify?: (n: unknown) => Promise<void>;
  };
};

/**
 * Build a `report(value, total?)` function bound to the client's
 * progressToken. Returns a no-op if no token was supplied.
 *
 * Errors from the transport are swallowed (the request will still finish
 * and return its CallToolResult normally) — a failed progress emission
 * is not a fatal error.
 */
export function makeProgressReporter(extra: ProgressExtra): (value: number, total?: number, message?: string) => void {
  const token = extra?.mcpReq?._meta?.progressToken ?? extra?._meta?.progressToken;
  const send = extra?.mcpReq?.notify?.bind(extra.mcpReq) ?? extra?.sendNotification?.bind(extra);
  if (token === undefined || token === null || !send) {
    return () => { /* no token or no transport, no progress */ };
  }
  return (value: number, total?: number, message?: string) => {
    send({
      method: 'notifications/progress',
      params: {
        progressToken: token,
        progress: value,
        ...(total !== undefined ? { total } : {}),
        ...(message !== undefined ? { message } : {}),
      },
    }).catch(() => { /* swallow — progress is best-effort */ });
  };
}

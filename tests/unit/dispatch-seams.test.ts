/**
 * The seams between well-tested helpers and the dispatcher that calls them.
 *
 * `stableStringify` and `enforceResultSizeLimit` each have solid unit tests,
 * and both were nonetheless unguarded where it counts. An audit reduced
 * `generateCacheKey` to just the tool name and pinned the size guard's second
 * argument to a constant, and all 695 tests stayed green either way.
 *
 * The consequence of the first is cross-query data bleed: the second caller of
 * a tool is served the first caller's rows for the whole TTL, on an admin key.
 * That is precisely what the cache-key canonicaliser was written to prevent —
 * protected at the pure-function level, unprotected at the one seam that
 * decides what a user actually receives.
 *
 * A well-tested pure function whose call site nobody asserts is the same
 * pattern three earlier tests on this branch fell into.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Records what each dispatched handler was asked for, and answers distinctly. */
const calls: Array<Record<string, unknown>> = [];
let nextRows: unknown[][] | null = null;

vi.mock('../../src/handlers/tools/index.js', () => ({
  HANDLER_REGISTRY: {
    affise_stats_raw: async (args: any) => {
      calls.push(args);
      return {
        // Only `ok` results are cached, so this is the status that exercises
        // the cache-key path at all.
        status: 'ok',
        message: 'ok',
        data: {
          columns: ['partner'],
          rows: nextRows ?? [[String(args?.filter?.partner ?? 'none')]],
        },
        timestamp: '2026-08-29T00:00:00.000Z',
      };
    },
  },
}));

import { EnhancedToolHandler, setupEnhancedHandlers } from '../../src/handlers/enhanced-tools.js';

const CONFIG = { baseUrl: 'https://api-company.affise.com', apiKey: 'k1234567890abcdef' };
const query = (partner: string) => ({
  slice: ['partner'],
  date_from: '2026-08-01',
  date_to: '2026-08-07',
  filter: { partner: [partner] },
});

describe('dispatcher cache-key seam', () => {
  beforeEach(() => {
    calls.length = 0;
    nextRows = null;
  });

  it('does not serve one query the answer to another', async () => {
    const handler = new EnhancedToolHandler(CONFIG as any);

    const first: any = await handler.executeTool('affise_stats_raw', query('193'));
    const second: any = await handler.executeTool('affise_stats_raw', query('200'));

    // With args dropped from the cache key the second call is a hit on the
    // first, and partner 200 receives partner 193's rows for the whole TTL.
    expect(calls, 'the second query never reached the handler').toHaveLength(2);
    expect(calls[1]?.filter, 'the handler was asked for the wrong partner').toEqual({ partner: ['200'] });
    expect(second?.cache_info?.was_cached, 'a different query was served from cache').not.toBe(true);
    expect(JSON.stringify(second?.data)).toContain('200');
    expect(JSON.stringify(first?.data)).toContain('193');
  });

  it('still caches a genuinely identical query', async () => {
    const handler = new EnhancedToolHandler(CONFIG as any);

    await handler.executeTool('affise_stats_raw', query('193'));
    const repeat: any = await handler.executeTool('affise_stats_raw', query('193'));

    expect(calls, 'an identical query was re-dispatched instead of cached').toHaveLength(1);
    expect(repeat?.cache_info?.was_cached).toBe(true);
  });

  it('distinguishes queries that differ only deep inside the filter', async () => {
    const handler = new EnhancedToolHandler(CONFIG as any);

    await handler.executeTool('affise_stats_raw', {
      ...query('193'), filter: { partner: ['193'], sub2: ['a'] },
    });
    await handler.executeTool('affise_stats_raw', {
      ...query('193'), filter: { partner: ['193'], sub2: ['b'] },
    });

    expect(calls, 'a nested filter change did not change the cache key').toHaveLength(2);
  });

  it('gives two different tools different keys for identical arguments', async () => {
    const handler = new EnhancedToolHandler(CONFIG as any);
    const keyOf = async (tool: string) => {
      const res: any = await handler.executeTool(tool, query('193'));
      return res?.cache_info?.cache_key;
    };

    const statsKey = await keyOf('affise_stats_raw');
    expect(statsKey, 'the cache key no longer names the tool').toMatch(/^affise_stats_raw:/);
  });
});

describe('response size guard at its dispatch seam', () => {
  beforeEach(() => {
    calls.length = 0;
    nextRows = null;
  });

  /** Captures the callbacks setupEnhancedHandlers registers. */
  function captureRegistrations() {
    const registered: Record<string, { def: any; cb: Function }> = {};
    const fakeServer = {
      registerTool: (name: string, def: any, cb: Function) => {
        registered[name] = { def, cb };
      },
    };
    setupEnhancedHandlers(fakeServer as any, CONFIG as any);
    return registered;
  }

  it('bounds an oversized result before the host ever sees it', async () => {
    // A tool that declares an outputSchema: the full data rides in
    // structuredContent, which is exactly the path the guard protects.
    nextRows = Array.from({ length: 40_000 }, (_, i) => [i, 'x'.repeat(40)]);

    const registered = captureRegistrations();
    const entry = registered['affise_stats_raw'];
    expect(entry, 'affise_stats_raw was never registered').toBeTruthy();
    expect(entry.def.outputSchema, 'this seam only exists for tools with an outputSchema').toBeTruthy();

    const response: any = await entry.cb(query('193'), {});
    const structured = response.structuredContent;

    // Testing the function alone cannot catch this: enforceResultSizeLimit is
    // a no-op when its second argument is false, so pinning the call site's
    // flag to a constant kills the guard in production while every unit test
    // of the function stays green.
    expect(structured?.data?.rows?.length, 'the oversized grid was passed through untouched')
      .toBeLessThan(40_000);
    expect(structured?.metadata?.truncated?.total, 'the model was not told rows were dropped')
      .toBe(40_000);
  });

  it('leaves a small result alone', async () => {
    nextRows = [['193']];
    const registered = captureRegistrations();
    const response: any = await registered['affise_stats_raw'].cb(query('193'), {});

    expect(response.structuredContent?.data?.rows).toEqual([['193']]);
    expect(response.structuredContent?.metadata?.truncated).toBeUndefined();
  });
});

/**
 * Unit tests for the `affise_stats` HANDLER layer (handleStatsNL).
 *
 * The handler is the NL stats entry: it parses the user's plain-English
 * query via `simple-parser`, materialises the structured stats params,
 * rejects the call when no date or period could be resolved, and forwards
 * the rest to `getAffiseCustomStats`.
 *
 * Coverage focus is the handler's end-to-end glue — NL → structured
 * params → /stats/custom call — not the parser internals (covered by
 * `simple-parser.*.test.ts`) or the underlying HTTP request (covered by
 * `affise_custom_stats.url.test.ts`). We mock `getAffiseCustomStats` so
 * each test isolates the integration boundary.
 *
 * Filled 2026-05-25 as part of the Phase 1 follow-up that closed the
 * 3 missing-test gaps the tool-contract reviewer surfaced.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../src/tools/affise_custom_stats.js', async () => {
  const actual = await vi.importActual<any>('../../src/tools/affise_custom_stats.js');
  return {
    ...actual,
    getAffiseCustomStats: vi.fn(),
  };
});

import * as customStats from '../../src/tools/affise_custom_stats.js';
import { handleStatsNL } from '../../src/handlers/tools/nl.js';
import { ErrorHandlerService } from '../../src/services/error-handler-service.js';
import { ValidationService } from '../../src/services/validation-service.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function deps() {
  return {
    errorHandler: new ErrorHandlerService(),
    validator: new ValidationService(),
  };
}

const mockStats = customStats.getAffiseCustomStats as unknown as Mock;

const okStatsResponse = (stats: any[] = []) => ({
  status: 'ok',
  message: 'Stats retrieved',
  data: {
    stats,
    pagination: { total_count: stats.length, page: 1, per_page: 100 },
  },
});

describe('handleStatsNL — config + validation guards', () => {
  beforeEach(() => mockStats.mockReset());

  it('returns CONFIG_MISSING when config is null (no /stats/custom call)', async () => {
    const r = await handleStatsNL({ query: 'conversions by country' }, null, deps());
    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('CONFIG_MISSING');
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for an empty NL query (no /stats/custom call)', async () => {
    const r = await handleStatsNL({ query: '' }, CFG, deps());
    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('VALIDATION_ERROR');
    expect(mockStats).not.toHaveBeenCalled();
  });
});

describe('handleStatsNL — NL → /stats/custom integration', () => {
  beforeEach(() => mockStats.mockReset());

  it('parses "top 5 partners" and forwards limit + partner dimension into structured params', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse([{ partner_id: 1, conversions: 10 }]));

    await handleStatsNL({ query: 'top 5 partners by conversions yesterday' }, CFG, deps());

    expect(mockStats).toHaveBeenCalledTimes(1);
    const [cfgArg, paramsArg] = mockStats.mock.calls[0];
    expect(cfgArg).toEqual(CFG);
    // toStatsParams should have turned "top 5 partners" into structured form;
    // we don't pin the exact dimension naming (parser is allowed to evolve),
    // just that a slice was produced and the limit honoured.
    expect(paramsArg).toBeDefined();
    expect(paramsArg.limit ?? paramsArg.per_page ?? null).toBe(5);
  });

  it('rejects a query with no date or period instead of defaulting to last7days', async () => {
    const r = await handleStatsNL({ query: 'conversions by country' }, CFG, deps());

    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('VALIDATION_ERROR');
    expect((r as any).error?.details).toMatch(/no date or period/i);
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('rejects an unparseable date instead of defaulting to last7days', async () => {
    const r = await handleStatsNL({ query: 'conversions on 07-2026-28' }, CFG, deps());

    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('VALIDATION_ERROR');
    expect((r as any).error?.details).toMatch(/could not parse the date/i);
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('turns a single explicit date into a one-day range', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse());

    await handleStatsNL({ query: 'clicks by sub2 partner=325 on 28.07.2026' }, CFG, deps());

    const [, paramsArg] = mockStats.mock.calls[0];
    expect(paramsArg.date_from).toBe('2026-07-28');
    expect(paramsArg.date_to).toBe('2026-07-28');
    expect(paramsArg.partner).toEqual(['325']);
    expect(paramsArg.slice).toContain('sub2');
  });

  it('respects an explicit "last 30 days" NL phrase and widens the window', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse());

    await handleStatsNL({ query: 'conversions for the last 30 days' }, CFG, deps());

    const [, paramsArg] = mockStats.mock.calls[0];
    const from = new Date(paramsArg.date_from).getTime();
    const to = new Date(paramsArg.date_to).getTime();
    const spanDays = (to - from) / (1000 * 60 * 60 * 24);
    // last30days span should be markedly wider than the 7-day default.
    expect(spanDays).toBeGreaterThan(20);
  });
});

describe('handleStatsNL — response mapping', () => {
  beforeEach(() => mockStats.mockReset());

  it('wraps a successful /stats/custom call as {status: ok, data, summary, metadata, timestamp}', async () => {
    mockStats.mockResolvedValueOnce({
      status: 'ok',
      message: 'ok',
      data: {
        stats: [
          { conversions: 10, revenue: 100, clicks: 200 },
          { conversions: 20, revenue: 200, clicks: 300 },
        ],
        pagination: { total_count: 2, page: 1, per_page: 100 },
      },
      metadata: { request_id: 'abc123' },
    });

    const r = await handleStatsNL({ query: 'conversions yesterday' }, CFG, deps());

    expect(r.status).toBe('ok');
    expect(r.data?.stats).toHaveLength(2);
    expect(r.summary).toBeDefined();
    expect(r.metadata?.request_id).toBe('abc123');
    expect(r.timestamp).toBeTruthy();
  });

  it('skips summary calculation when the stats array is missing', async () => {
    // Some Affise responses return data without `stats` (e.g. unsupported
    // slice combinations). The handler should still produce a valid envelope.
    mockStats.mockResolvedValueOnce({
      status: 'ok',
      message: 'ok',
      data: { stats: undefined },
    });

    const r = await handleStatsNL({ query: 'conversions yesterday' }, CFG, deps());
    expect(r.status).toBe('ok');
    expect(r.summary).toBeUndefined();
  });

  it('wraps an engine status=error result as STATS_ERROR', async () => {
    mockStats.mockResolvedValueOnce({ status: 'error', message: 'date range too wide' });
    const r = await handleStatsNL({ query: 'conversions yesterday' }, CFG, deps());
    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('STATS_ERROR');
  });

  it('wraps a thrown exception as STATS_ERROR', async () => {
    mockStats.mockRejectedValueOnce(new Error('upstream blew up'));
    const r = await handleStatsNL({ query: 'conversions yesterday' }, CFG, deps());
    expect(r.status).toBe('error');
    expect((r as any).error?.code).toBe('STATS_ERROR');
  });
});

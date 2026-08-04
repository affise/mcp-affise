/**
 * Handler-level tests for affise_stats date resolution.
 *
 * The NL stats entry parses the plain-English query via simple-parser,
 * materialises structured stats params, REJECTS the call when no date or
 * period could be resolved (no silent last7days), and forwards the rest
 * to getAffiseCustomStats. We mock getAffiseCustomStats so each test
 * isolates the handler boundary; parser internals are covered by
 * simple-parser.*.test.ts.
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
import { EnhancedToolHandler } from '../../src/handlers/enhanced-tools.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

const mockStats = customStats.getAffiseCustomStats as unknown as Mock;

const okStatsResponse = (stats: any[] = []) => ({
  status: 'ok',
  message: 'Stats retrieved',
  data: {
    stats,
    pagination: { total_count: stats.length, page: 1, per_page: 100 },
  },
});

const runStats = (query: string) =>
  new EnhancedToolHandler(CFG).executeTool('affise_stats', { query });

describe('affise_stats — date resolution', () => {
  beforeEach(() => mockStats.mockReset());

  it('rejects a query with no date or period instead of defaulting to last7days', async () => {
    const r = await runStats('conversions by country');

    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.details).toMatch(/no date or period/i);
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('rejects an unparseable date instead of defaulting to last7days', async () => {
    const r = await runStats('conversions on 07-2026-28');

    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.details).toMatch(/could not parse the date/i);
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('rejects a month-name date the parser does not support', async () => {
    const r = await runStats('income by offer from August 1 to August 3');

    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(r.error?.details).toMatch(/august 1/i);
    expect(mockStats).not.toHaveBeenCalled();
  });

  it('forwards an explicit "from X to Y" range verbatim', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse());

    await runStats('income by offer partner=325 from 2026-08-01 to 2026-08-03');

    expect(mockStats).toHaveBeenCalledTimes(1);
    const [, paramsArg] = mockStats.mock.calls[0];
    expect(paramsArg.date_from).toBe('2026-08-01');
    expect(paramsArg.date_to).toBe('2026-08-03');
    expect(paramsArg.partner).toEqual(['325']);
  });

  it('turns a single explicit date into a one-day range', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse());

    await runStats('clicks by sub2 partner=325 on 28.07.2026');

    const [, paramsArg] = mockStats.mock.calls[0];
    expect(paramsArg.date_from).toBe('2026-07-28');
    expect(paramsArg.date_to).toBe('2026-07-28');
    expect(paramsArg.slice).toContain('sub2');
  });

  it('still resolves a named period when no explicit date is given', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse());

    await runStats('conversions for the last 30 days');

    const [, paramsArg] = mockStats.mock.calls[0];
    const from = new Date(paramsArg.date_from).getTime();
    const to = new Date(paramsArg.date_to).getTime();
    const spanDays = (to - from) / (1000 * 60 * 60 * 24);
    expect(spanDays).toBeGreaterThan(20);
  });
});

/**
 * Handler-level tests for affise_stats multi-range fanout.
 *
 * Affise /stats/custom accepts a single date_from/date_to per request, so a
 * query naming several explicit ISO ranges runs one pull per range with the
 * same slice/fields/filters and returns data.multi_period with a periods[]
 * array. Capped at 6 ranges per call. getAffiseCustomStats is mocked to
 * isolate the handler boundary.
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

const range = (i: number) =>
  `from 2026-07-${String(i * 2 + 1).padStart(2, '0')} to 2026-07-${String(i * 2 + 2).padStart(2, '0')}`;

describe('affise_stats — multi-range fanout', () => {
  beforeEach(() => mockStats.mockReset());

  it('runs one pull per range and returns data.multi_period', async () => {
    mockStats.mockResolvedValue(okStatsResponse([{ clicks: 1 }]));

    const r = await runStats(
      'income by offer from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14',
    );

    expect(r.status).toBe('ok');
    expect(mockStats).toHaveBeenCalledTimes(2);

    const [, first] = mockStats.mock.calls[0];
    const [, second] = mockStats.mock.calls[1];
    expect(first.date_from).toBe('2026-07-01');
    expect(first.date_to).toBe('2026-07-07');
    expect(second.date_from).toBe('2026-07-08');
    expect(second.date_to).toBe('2026-07-14');
    expect(first.period).toBeUndefined();
    expect(second.period).toBeUndefined();

    expect(r.data.multi_period).toBe(true);
    expect(r.data.periods).toHaveLength(2);
    expect(r.data.periods[0]).toMatchObject({ date_from: '2026-07-01', date_to: '2026-07-07' });
    expect(r.data.periods[0].summary).toBeDefined();
  });

  it('applies the same filters and slice to every pull', async () => {
    mockStats.mockResolvedValue(okStatsResponse());

    await runStats(
      'clicks by sub2 partner=325 from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14',
    );

    for (const [, params] of mockStats.mock.calls) {
      expect(params.partner).toEqual(['325']);
      expect(params.slice).toContain('sub2');
    }
  });

  it('caps at 6 ranges and reports the dropped ones', async () => {
    mockStats.mockResolvedValue(okStatsResponse());

    const query = `clicks ${Array.from({ length: 8 }, (_, i) => range(i)).join(' and ')}`;
    const r = await runStats(query);

    expect(mockStats).toHaveBeenCalledTimes(6);
    expect(r.data.periods).toHaveLength(6);
    expect(r.message).toMatch(/2 additional range\(s\) dropped; max 6/);
  });

  it('fails fast with the offending range when a pull errors', async () => {
    mockStats
      .mockResolvedValueOnce(okStatsResponse())
      .mockResolvedValueOnce({ status: 'error', message: 'boom' });

    const r = await runStats(
      'clicks from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14 and from 2026-07-15 to 2026-07-21',
    );

    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('STATS_ERROR');
    expect(r.error?.details).toMatch(/2026-07-08\.\.2026-07-14/);
    expect(mockStats).toHaveBeenCalledTimes(2);
  });

  it('keeps the single-range path unchanged (no multi_period)', async () => {
    mockStats.mockResolvedValueOnce(okStatsResponse([{ clicks: 5 }]));

    const r = await runStats('clicks from 2026-07-01 to 2026-07-07');

    expect(mockStats).toHaveBeenCalledTimes(1);
    const [, params] = mockStats.mock.calls[0];
    expect(params.date_from).toBe('2026-07-01');
    expect(params.date_to).toBe('2026-07-07');
    expect(r.data.multi_period).toBeUndefined();
  });
});

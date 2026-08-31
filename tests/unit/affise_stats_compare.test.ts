/**
 * Tests for period-over-period comparison (src/tools/affise_stats_compare.ts).
 * getAffiseCustomStats is mocked so we assert aggregation + delta math, not the API.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/tools/affise_custom_stats.js', () => ({
  getAffiseCustomStats: vi.fn(),
}));

import { getAffiseCustomStats } from '../../src/tools/affise_custom_stats.js';
import { compareStats } from '../../src/tools/affise_stats_compare.js';

const CONFIG = { baseUrl: 'https://api.example.com', apiKey: 'k' };
const COLS = ['slice.day', 'traffic.raw', 'actions.total.count', 'actions.total.earning'];

beforeEach(() => {
  (getAffiseCustomStats as any).mockReset();
  (getAffiseCustomStats as any).mockImplementation(async (_c: any, p: any) => {
    // current range starts 2026-07-01; baseline is the preceding window.
    if (p.date_from === '2026-07-01') {
      return { status: 'ok', data: { columns: COLS, rows: [[1, 100, 10, 5], [2, 200, 20, 7]] } };
    }
    return { status: 'ok', data: { columns: COLS, rows: [[1, 120, 4, 4], [2, 80, 6, 4]] } };
  });
});

describe('compareStats', () => {
  it('sums daily rows into period totals and recomputes cr', async () => {
    const r = await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07' });
    expect(r.status).toBe('ok');
    expect(r.data!.current.totals['traffic.raw']).toBe(300);
    expect(r.data!.current.totals['actions.total.count']).toBe(30);
    expect(r.data!.current.totals['actions.total.earning']).toBe(12);
    expect(r.data!.current.totals['cr.total']).toBe(10); // 30/300*100
    expect(r.data!.baseline.totals['traffic.raw']).toBe(200);
    expect(r.data!.baseline.totals['cr.total']).toBe(5); // 10/200*100
  });

  it('computes abs + pct deltas for additive metrics and pp for rates', async () => {
    const r = await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07' });
    const d = r.data!.delta;
    expect(d['traffic.raw']).toEqual({ current: 300, baseline: 200, abs: 100, pct: 50 });
    expect(d['actions.total.count']).toEqual({ current: 30, baseline: 10, abs: 20, pct: 200 });
    expect(d['cr.total']).toEqual({ current: 10, baseline: 5, pp: 5 });
  });

  it('derives the baseline as the equal preceding window for explicit dates', async () => {
    const r = await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07' });
    expect(r.data!.baseline.range).toEqual({ from: '2026-06-24', to: '2026-06-30' });
    expect(r.data!.partial).toBe(false);
    expect(r.data!.note).toContain('2026-07-01…2026-07-07');
  });

  it('marks pct null when the baseline is zero', async () => {
    (getAffiseCustomStats as any).mockImplementation(async (_c: any, p: any) => {
      if (p.date_from === '2026-07-01') {
        return { status: 'ok', data: { columns: COLS, rows: [[1, 100, 10, 5]] } };
      }
      return { status: 'ok', data: { columns: COLS, rows: [[1, 0, 0, 0]] } };
    });
    const r = await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07' });
    expect(r.data!.delta['traffic.raw'].pct).toBeNull();
  });

  it('surfaces an error when a range pull fails', async () => {
    (getAffiseCustomStats as any).mockImplementation(async (_c: any, p: any) => {
      if (p.date_from === '2026-07-01') return { status: 'ok', data: { columns: COLS, rows: [] } };
      return { status: 'error', message: 'boom' };
    });
    const r = await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07' });
    expect(r.status).toBe('error');
    expect(r.message).toContain('Baseline range failed');
  });

  it('forwards filter keys to the underlying stats call', async () => {
    await compareStats(CONFIG, { date_from: '2026-07-01', date_to: '2026-07-07', filter: { partner: ['193'], offer: [95119] } });
    const calls = (getAffiseCustomStats as any).mock.calls;
    expect(calls[0][1].partner).toEqual(['193']);
    expect(calls[0][1].offer).toEqual([95119]);
    expect(calls[0][1].slice).toEqual(['day']);
  });
});

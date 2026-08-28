/**
 * Tests for period-over-period range alignment (src/utils/period-align.ts).
 * Uses a fixed referenceDate so "today" is deterministic.
 */
import { describe, it, expect } from 'vitest';
import { alignedRanges, precedingWindow } from '../../src/utils/period-align.js';

const REF = new Date(2026, 6, 7); // 2026-07-07 (Tue)

describe('alignedRanges', () => {
  it('month-to-date compares against the same day-range last month', () => {
    const r = alignedRanges('thismonth', { referenceDate: REF });
    expect(r.current).toEqual({ from: '2026-07-01', to: '2026-07-07' });
    expect(r.baseline).toEqual({ from: '2026-06-01', to: '2026-06-07' });
    expect(r.currentDays).toBe(7);
    expect(r.baselineDays).toBe(7);
    expect(r.partial).toBe(true);
  });

  it('week shifts back exactly 7 days (same weekdays)', () => {
    const r = alignedRanges('thisweek', { referenceDate: REF });
    // week is Mon-based; 2026-07-07 is Tue → week starts Mon 2026-07-06
    expect(r.current).toEqual({ from: '2026-07-06', to: '2026-07-07' });
    expect(r.baseline).toEqual({ from: '2026-06-29', to: '2026-06-30' });
  });

  it('rolling last7days uses the equal window immediately before', () => {
    const r = alignedRanges('last7days', { referenceDate: REF });
    expect(r.currentDays).toBe(r.baselineDays);
    expect(r.baseline.to < r.current.from).toBe(true);
    expect(r.partial).toBe(false);
  });

  it('clamps the baseline day when the prior month is shorter', () => {
    const r = alignedRanges('thismonth', { referenceDate: new Date(2026, 2, 31) }); // Mar 31
    expect(r.baseline).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('rolls over the year for a January reference', () => {
    const r = alignedRanges('thismonth', { referenceDate: new Date(2026, 0, 5) }); // Jan 5
    expect(r.baseline).toEqual({ from: '2025-12-01', to: '2025-12-05' });
  });

  it('this quarter aligns to the same offset of the prior quarter', () => {
    const r = alignedRanges('thisquarter', { referenceDate: REF }); // Q3 starts Jul 1
    expect(r.current.from).toBe('2026-07-01');
    expect(r.baseline).toEqual({ from: '2026-04-01', to: '2026-04-07' });
  });

  it('this year aligns to the same offset of the prior year', () => {
    const r = alignedRanges('thisyear', { referenceDate: REF });
    expect(r.current).toEqual({ from: '2026-01-01', to: '2026-07-07' });
    expect(r.baseline).toEqual({ from: '2025-01-01', to: '2025-07-07' });
  });

  it('yesterday compares to the prior day', () => {
    const r = alignedRanges('yesterday', { referenceDate: REF });
    expect(r.current).toEqual({ from: '2026-07-06', to: '2026-07-06' });
    expect(r.baseline).toEqual({ from: '2026-07-05', to: '2026-07-05' });
  });

  it('note describes both aligned ranges', () => {
    const r = alignedRanges('thismonth', { referenceDate: REF });
    expect(r.note).toContain('2026-07-01…2026-07-07');
    expect(r.note).toContain('2026-06-01…2026-06-07');
  });
});

describe('precedingWindow', () => {
  it('returns the equal-length window ending the day before', () => {
    expect(precedingWindow({ from: '2026-07-01', to: '2026-07-07' }))
      .toEqual({ from: '2026-06-24', to: '2026-06-30' });
  });
});

/**
 * Tests for explicit "from YYYY-MM-DD to YYYY-MM-DD" date-range extraction
 * and its precedence over named periods in toStatsParams().
 */

import { describe, it, expect } from 'vitest';
import { extractExplicitDateRange, extractExplicitDateRanges, parseQuery, toStatsParams } from '../../src/types/simple-parser.js';

describe('extractExplicitDateRange', () => {
  it('parses "from X to Y"', () => {
    expect(extractExplicitDateRange('top 20 partners by revenue from 2026-06-29 to 2026-07-05'))
      .toEqual({ date_from: '2026-06-29', date_to: '2026-07-05' });
  });

  it('parses "between X and Y"', () => {
    expect(extractExplicitDateRange('clicks between 2026-01-01 and 2026-01-31'))
      .toEqual({ date_from: '2026-01-01', date_to: '2026-01-31' });
  });

  it('parses bare "X - Y" and "X to Y" forms', () => {
    expect(extractExplicitDateRange('stats 2026-05-01 - 2026-05-31'))
      .toEqual({ date_from: '2026-05-01', date_to: '2026-05-31' });
    expect(extractExplicitDateRange('stats 2026-05-01 to 2026-05-31'))
      .toEqual({ date_from: '2026-05-01', date_to: '2026-05-31' });
  });

  it('swaps a reversed range', () => {
    expect(extractExplicitDateRange('from 2026-07-05 to 2026-06-29'))
      .toEqual({ date_from: '2026-06-29', date_to: '2026-07-05' });
  });

  it('rejects calendar-invalid dates', () => {
    expect(extractExplicitDateRange('from 2026-02-30 to 2026-03-05')).toBeUndefined();
    expect(extractExplicitDateRange('from 2026-13-01 to 2026-13-05')).toBeUndefined();
  });

  it('returns undefined when no range is present', () => {
    expect(extractExplicitDateRange('top partners last month')).toBeUndefined();
  });
});

describe('extractExplicitDateRanges (multiple ranges)', () => {
  it('returns both ranges from "from A to B and from C to D"', () => {
    expect(extractExplicitDateRanges(
      'export stats from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14 by sub2',
    )).toEqual([
      { date_from: '2026-07-01', date_to: '2026-07-07' },
      { date_from: '2026-07-08', date_to: '2026-07-14' },
    ]);
  });

  it('preserves query order and dedupes overlapping pattern matches', () => {
    // "X to Y" matches both the from/to and the bare pattern — must appear once.
    expect(extractExplicitDateRanges('stats 2026-05-01 to 2026-05-31')).toEqual([
      { date_from: '2026-05-01', date_to: '2026-05-31' },
    ]);
  });

  it('skips a calendar-invalid range but keeps a valid sibling', () => {
    expect(extractExplicitDateRanges(
      'from 2026-02-30 to 2026-03-05 and from 2026-04-01 to 2026-04-07',
    )).toEqual([{ date_from: '2026-04-01', date_to: '2026-04-07' }]);
  });

  it('returns [] when no range present', () => {
    expect(extractExplicitDateRanges('top partners last month')).toEqual([]);
  });

  it('singular extractExplicitDateRange returns the first range', () => {
    expect(extractExplicitDateRange(
      'from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14',
    )).toEqual({ date_from: '2026-07-01', date_to: '2026-07-07' });
  });
});

describe('parseQuery + toStatsParams date-range integration', () => {
  it('carries the range into parseQuery output and boosts confidence', () => {
    const parsed = parseQuery('top 20 partners by revenue from 2026-06-29 to 2026-07-05');
    expect(parsed.date_from).toBe('2026-06-29');
    expect(parsed.date_to).toBe('2026-07-05');
    expect(parsed.suggestions.some(s => /time period/i.test(s))).toBe(false);
  });

  it('explicit dates land in stats params and suppress the default period', () => {
    const params = toStatsParams(parseQuery('clicks by country from 2026-06-01 to 2026-06-15'));
    expect(params.date_from).toBe('2026-06-01');
    expect(params.date_to).toBe('2026-06-15');
    expect(params.period).toBeUndefined();
  });

  it('explicit dates win over a named period in the same query', () => {
    const params = toStatsParams(parseQuery('clicks last month from 2026-06-01 to 2026-06-15'));
    expect(params.date_from).toBe('2026-06-01');
    expect(params.date_to).toBe('2026-06-15');
    expect(params.period).toBeUndefined();
  });

  it('named periods still work when no explicit range is given', () => {
    const params = toStatsParams(parseQuery('clicks by country last month'));
    expect(params.period).toBe('lastmonth');
    expect(params.date_from).toBeUndefined();
  });
});

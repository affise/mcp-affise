/**
 * A single explicit date must resolve to a one-day range.
 *
 * Before this, only date PAIRS ("from A to B") were recognised — a lone
 * "2026-07-28" or "28.07.2026" was dropped and the caller silently
 * substituted last7days, so the answer looked valid but covered the wrong days.
 */

import { describe, it, expect } from 'vitest';
import { parseQuery, extractSingleDate, findDateLikeToken } from '../../src/types/simple-parser.js';

describe('extractSingleDate', () => {
  it.each([
    ['stats for 2026-07-28', '2026-07-28'],
    ['stats for 28.07.2026', '2026-07-28'],
    ['stats for 28/07/2026', '2026-07-28'],
    ['stats for 28-07-2026', '2026-07-28'],
    ['stats for 2026.07.28', '2026-07-28'],
    ['stats for 1.2.2026', '2026-02-01'],
  ])('%s → %s', (query, expected) => {
    expect(extractSingleDate(query)).toEqual({ date_from: expected, date_to: expected });
  });

  it('reads an unambiguous month-first pair as MM/DD/YYYY', () => {
    expect(extractSingleDate('stats for 07/28/2026')).toEqual({
      date_from: '2026-07-28',
      date_to: '2026-07-28',
    });
  });

  it('rejects a calendar-invalid date', () => {
    expect(extractSingleDate('stats for 2026-02-30')).toBeUndefined();
    expect(extractSingleDate('stats for 32.07.2026')).toBeUndefined();
  });

  it('ignores numbers that are not dates', () => {
    expect(extractSingleDate('top 10 partners by clicks')).toBeUndefined();
    expect(extractSingleDate('stats for partner 325 by sub2')).toBeUndefined();
  });
});

describe('parseQuery — single date wiring', () => {
  it('exposes a one-day range', () => {
    const p = parseQuery('clicks by sub2 on 2026-07-28');
    expect(p.date_from).toBe('2026-07-28');
    expect(p.date_to).toBe('2026-07-28');
  });

  it('lets an explicit range win over a lone date', () => {
    const p = parseQuery('clicks from 2026-07-01 to 2026-07-15');
    expect(p.date_from).toBe('2026-07-01');
    expect(p.date_to).toBe('2026-07-15');
  });
});

describe('findDateLikeToken', () => {
  it('reports malformed numeric dates', () => {
    expect(findDateLikeToken('conversions on 07-2026-28')).toBeTruthy();
    expect(findDateLikeToken('conversions on 2026/13/45')).toBeTruthy();
  });

  it('reports month-name forms the parser does not support', () => {
    expect(findDateLikeToken('conversions on 28 july')).toBe('28 july');
    expect(findDateLikeToken('conversions on july 28')).toBe('july 28');
  });

  it('stays quiet on queries with no date-like token', () => {
    expect(findDateLikeToken('top 10 partners by revenue')).toBeUndefined();
    expect(findDateLikeToken('clicks by sub2 partner=325')).toBeUndefined();
  });
});

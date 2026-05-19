/**
 * Tests for sub-ID dimension extraction in the NL parser.
 *
 * Sub-IDs (sub1..sub30) are recognized as slice dimensions when prefixed
 * with an explicit marker: "by subN", "breakdown by subN", "top N by subM",
 * "top N subM". Bare `subN` is NOT recognized as a dimension because that's
 * the filter key=value form (handled separately by extractFilters).
 *
 * The Affise endpoint accepts sub1..sub30 as slice/order values; filter is
 * capped at sub8 (per Filter.php).
 */

import { parseQuery, toStatsParams } from '../../src/types/simple-parser.js';

describe('simple-parser — sub-ID dimensions', () => {
  describe('"by subN" form', () => {
    it('extracts sub5 from "stats by sub5 last week"', () => {
      const parsed = parseQuery('stats by sub5 last week');
      expect(parsed.dimensions).toContain('sub5');
    });

    it('extracts sub15 (sub IDs beyond 8 are valid for slice)', () => {
      const parsed = parseQuery('revenue by sub15 yesterday');
      expect(parsed.dimensions).toContain('sub15');
    });

    it('extracts sub30 (boundary)', () => {
      const parsed = parseQuery('show stats by sub30 last month');
      expect(parsed.dimensions).toContain('sub30');
    });

    it('does NOT extract sub31 (out of range)', () => {
      const parsed = parseQuery('stats by sub31 today');
      expect(parsed.dimensions).not.toContain('sub31');
    });

    it('extracts multiple sub dimensions from one query', () => {
      const parsed = parseQuery('breakdown by sub1 and sub5 last week');
      expect(parsed.dimensions).toContain('sub1');
      expect(parsed.dimensions).toContain('sub5');
    });
  });

  describe('"top N by subM" / "top N subM" form', () => {
    it('extracts sub5 from "top 10 by sub5 last week"', () => {
      const parsed = parseQuery('top 10 by sub5 last week');
      expect(parsed.dimensions).toContain('sub5');
    });

    it('extracts sub3 from "top 25 sub3 yesterday"', () => {
      const parsed = parseQuery('top 25 sub3 yesterday');
      expect(parsed.dimensions).toContain('sub3');
    });

    it('combines with existing top-N affiliate dimension', () => {
      const parsed = parseQuery('top 10 affiliates by sub5 last month');
      expect(parsed.dimensions).toContain('affiliate');
      expect(parsed.dimensions).toContain('sub5');
    });
  });

  describe('"breakdown by subN" form', () => {
    it('extracts sub7 from "breakdown by sub7 last 30 days"', () => {
      const parsed = parseQuery('breakdown by sub7 last 30 days');
      expect(parsed.dimensions).toContain('sub7');
    });
  });

  describe('bare subN (filter form) is NOT a dimension', () => {
    it('does NOT add sub5 as dimension when used as filter "sub5=abc"', () => {
      const parsed = parseQuery('stats for sub5=abc last week');
      expect(parsed.dimensions).not.toContain('sub5');
    });

    it('does NOT add sub3 when used in key:value form', () => {
      const parsed = parseQuery('show stats sub3: xyz today');
      expect(parsed.dimensions).not.toContain('sub3');
    });

    it('does NOT accidentally match in unrelated text', () => {
      const parsed = parseQuery('top 10 substring matches today');
      // "substring" contains "sub" but not "subN" — no match.
      expect(parsed.dimensions.filter(d => d.startsWith('sub'))).toEqual([]);
    });
  });

  describe('toStatsParams integration', () => {
    it('propagates sub5 dimension into params.slice', () => {
      const parsed = parseQuery('top 10 by sub5 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('sub5');
      expect(params.period).toBe('lastweek');
    });

    it('combines sub-dimension with filter from key=value', () => {
      const parsed = parseQuery('top 10 by sub5 partner=193 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('sub5');
      expect(params.partner).toEqual(['193']);
    });
  });

  describe('regression: existing dimensions still work', () => {
    it('"top 10 partners" still adds affiliate dimension', () => {
      const parsed = parseQuery('top 10 partners last week');
      expect(parsed.dimensions).toContain('affiliate');
    });

    it('"by country" still works', () => {
      const parsed = parseQuery('revenue by country last month');
      expect(parsed.dimensions).toContain('country');
    });

    it('"by os" still works (does not interfere with sub-id regex)', () => {
      const parsed = parseQuery('breakdown by os last week');
      expect(parsed.dimensions).toContain('os');
    });
  });
});

/**
 * Tests for sub-ID dimension extraction in the NL parser.
 *
 * Sub-IDs (sub1..sub30) are recognized as slice dimensions on ANY bare mention
 * in prose — "by subN", "breakdown by subN", "top N subM", or just
 * "sub2 stats for partner 325". No marker prefix is required. The one exception
 * is the key=value FILTER form (`subN=value` / `subN:value`), which is handled
 * by extractFilters and must NOT become a dimension.
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

  describe('bare subN in prose (no marker) IS a dimension', () => {
    it('extracts sub2 from "sub2 stats for partner 325"', () => {
      const parsed = parseQuery('sub2 stats for partner 325');
      expect(parsed.dimensions).toContain('sub2');
    });

    it('extracts sub2 from "statistics on sub2 for partner 325"', () => {
      const parsed = parseQuery('statistics on sub2 for partner 325');
      expect(parsed.dimensions).toContain('sub2');
    });
  });

  describe('regression: sub2 + partner filter (reported bug)', () => {
    // "by sub2 partner 325" — the greedy byGroupRegex used to pull `partner`
    // into the slice as an `affiliate` dimension, so the client saw a
    // day+affiliate breakdown instead of a sub2 breakdown for partner 325.
    it('"by sub2 partner 325" → slice=[sub2], filter partner=325, no affiliate', () => {
      const parsed = parseQuery('by sub2 partner 325 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('sub2');
      expect(params.slice).not.toContain('affiliate');
      expect(params.partner).toEqual(['325']);
    });

    it('"sub2 stats for partner 325" → slice=[sub2], filter partner=325', () => {
      const parsed = parseQuery('sub2 stats for partner 325 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('sub2');
      expect(params.slice).not.toContain('affiliate');
      expect(params.partner).toEqual(['325']);
    });

    it('"by country and sub2 for partner 325" keeps both dims + filter', () => {
      const parsed = parseQuery('by country and sub2 for partner 325 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('country');
      expect(params.slice).toContain('sub2');
      expect(params.partner).toEqual(['325']);
    });

    it('explicit "by partner" still yields an affiliate slice (not treated as filter)', () => {
      // "by partner 325 sub2" — user literally asked to slice by partner, so
      // affiliate stays; sub2 is added; 325 is still captured as a filter.
      const parsed = parseQuery('by partner 325 sub2 last week');
      const params = toStatsParams(parsed);
      expect(params.slice).toContain('affiliate');
      expect(params.slice).toContain('sub2');
      expect(params.partner).toEqual(['325']);
    });
  });

  describe('regression: multi-entity slices are not broken by the filter boundary', () => {
    it('"by affiliate and offer" keeps both slice dimensions', () => {
      const parsed = parseQuery('stats by affiliate and offer last week');
      expect(parsed.dimensions).toContain('affiliate');
      expect(parsed.dimensions).toContain('offer');
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

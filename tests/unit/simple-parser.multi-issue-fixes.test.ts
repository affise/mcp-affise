/**
 * Regression coverage for the six parser fixes shipped together:
 *
 *   A. Non-numeric partner names in prose ("for affiliate aff_demo") get
 *      extracted (and sub<N> tokens are NOT misread as partner clientIds).
 *   B. Multi-dimensional slice lists: "by X and Y", "by X, Y, Z", "by X Y Z".
 *   C. "dynamics" / "over time" / "trend" injects `day` into the slice.
 *   D. cost / charge / spend canonicalize to Affise field `costs`.
 *   E. "by goal" is a recognized slice dimension AND default fields are
 *      slice-aware so the validator doesn't strip `goal`.
 *   F. "top N <dim> by <metric>" produces limit + canonical order_by.
 *
 * Empirical proof of each fix lives in scripts/repro-client-bug.ts.
 */
import { describe, it, expect } from 'vitest';
import { parseQuery, extractFilters, toStatsParams } from '../../src/types/simple-parser';

describe('simple-parser multi-issue fixes (client report 2026-05-14)', () => {

  describe('A. non-numeric partner extraction', () => {
    it('extracts aff_demo as partner from "for affiliate aff_demo"', () => {
      expect(extractFilters('top 10 offer by charge for affiliate aff_demo last week'))
        .toEqual({ partner: ['aff_demo'] });
    });

    it('extracts hyphenated clientId "client-abc-123"', () => {
      expect(extractFilters('cost by OS for partner client-abc-123'))
        .toEqual({ partner: ['client-abc-123'] });
    });

    it('does NOT extract sub1 as partner in "by affiliate sub1 os" (false-positive guard)', () => {
      expect(extractFilters('cost dynamics by affiliate sub1 os last week'))
        .toEqual({});
    });

    it('does NOT extract bare English words like "offers" or "manager"', () => {
      expect(extractFilters('show partner offers')).toEqual({});
      expect(extractFilters('show partner manager')).toEqual({});
    });

    it('still extracts numeric partner ID via existing prose form', () => {
      expect(extractFilters('cost by OS for partner 12345 last week'))
        .toEqual({ partner: ['12345'] });
    });

    it('comma-separated clientIds: "for partner aff_a, aff_b"', () => {
      expect(extractFilters('stats for partner aff_a, aff_b last week'))
        .toEqual({ partner: ['aff_a', 'aff_b'] });
    });
  });

  describe('B. multi-dimensional slice extraction', () => {
    it('"by affiliate and sub1" captures both', () => {
      const p = parseQuery('cost dynamics by affiliate and sub1 last week');
      expect(p.dimensions).toContain('affiliate');
      expect(p.dimensions).toContain('sub1');
    });

    it('"by affiliate, sub1, os" (commas) captures all three', () => {
      const p = parseQuery('stats by affiliate, sub1, os last week');
      expect(p.dimensions).toContain('affiliate');
      expect(p.dimensions).toContain('sub1');
      expect(p.dimensions).toContain('os');
    });

    it('"by affiliate sub1 os" (space-separated) captures all three', () => {
      const p = parseQuery('cost dynamics by affiliate sub1 os last week');
      expect(p.dimensions).toContain('affiliate');
      expect(p.dimensions).toContain('sub1');
      expect(p.dimensions).toContain('os');
    });

    it('partner alias is normalised to affiliate inside compound lists', () => {
      const p = parseQuery('stats by partner and country last week');
      expect(p.dimensions).toContain('affiliate');
      expect(p.dimensions).toContain('country');
    });
  });

  describe('C. dynamics / over time / trend triggers day slice', () => {
    it('"cost dynamics by affiliate" prepends day', () => {
      const p = parseQuery('cost dynamics by affiliate last week');
      expect(p.dimensions).toContain('day');
      expect(p.dimensions).toContain('affiliate');
      // Day should be FIRST in slice (Affise convention)
      expect(p.dimensions.indexOf('day')).toBe(0);
    });

    it('"EPC over time by os" prepends day', () => {
      const p = parseQuery('EPC over time by os last week');
      expect(p.dimensions).toContain('day');
      expect(p.dimensions).toContain('os');
    });

    it('"trend by affiliate" prepends day', () => {
      const p = parseQuery('trend by affiliate last week');
      expect(p.dimensions).toContain('day');
      expect(p.dimensions).toContain('affiliate');
    });

    it('does NOT add day if hour or month already present', () => {
      const p = parseQuery('hourly dynamics by os last week');
      expect(p.dimensions).toContain('hour');
      expect(p.dimensions).not.toContain('day');
    });

    it('does NOT add day if "dynamics" word absent', () => {
      const p = parseQuery('stats by affiliate last week');
      expect(p.dimensions).not.toContain('day');
    });
  });

  describe('D. cost / charge / spend canonicalize to "income"', () => {
    // `costs` is an admin-only field in Affise — not in the standard whitelist.
    // Map all cost-synonyms to `income` (universally available) so non-admin
    // tenants get a working query instead of a 400.
    it('"cost dynamics" extracts income metric', () => {
      expect(parseQuery('cost dynamics by affiliate last week').metrics).toContain('income');
    });

    it('"by charge" extracts income metric', () => {
      expect(parseQuery('top 10 offer by charge last week').metrics).toContain('income');
    });

    it('"spend by os" extracts income metric', () => {
      expect(parseQuery('spend by os last week').metrics).toContain('income');
    });
  });

  describe('E. goal slice + slice-aware default fields', () => {
    it('"stats by goal" puts goal in dimensions', () => {
      expect(parseQuery('stats by goal last week').dimensions).toContain('goal');
    });

    it('toStatsParams keeps goal in slice (no clicks default that conflicts)', () => {
      const params = toStatsParams(parseQuery('stats by goal last week'));
      expect(params.slice).toContain('goal');
      // Default for goal must NOT include clicks (mutually exclusive per validator)
      expect(params.fields).not.toContain('clicks');
    });

    it('trafficback_reason gets the same conversion-side defaults', () => {
      // Manually construct since "by trafficback_reason" isn't a NL form we parse
      const params = toStatsParams({
        original: '',
        confidence: 1,
        countries: [],
        categories: [],
        devices: [],
        metrics: [],
        dimensions: ['trafficback_reason'],
        keywords: [],
        suggestions: [],
      });
      expect(params.fields).not.toContain('clicks');
    });
  });

  describe('F. top N → limit + canonical order_by', () => {
    it('"top 10 offers by charge" → limit=10, order_by=income (canonicalized)', () => {
      const p = parseQuery('top 10 offers by charge last week');
      expect(p.limit).toBe(10);
      expect(p.order_by).toBe('income');
    });

    it('"top 25 affiliates" → limit=25, no order_by', () => {
      const p = parseQuery('top 25 affiliates last week');
      expect(p.limit).toBe(25);
      expect(p.order_by).toBeUndefined();
    });

    it('toStatsParams propagates limit + canonicalized order field', () => {
      // Affise's order[] vocabulary differs from fields[]:
      // "by charge" → fields[]=income (display, universally available)
      //             + order[]=-total_revenue (sort).
      const params = toStatsParams(parseQuery('top 10 offers by charge last week'));
      expect(params.limit).toBe(10);
      // Affise's order[] is plain field names; direction goes in orderType.
      expect(params.order).toEqual(['total_revenue']);
      expect(params.orderType).toBe('desc');
      // `income` is the universally-available field; admin `costs` would 400
      // on non-admin tenants. The user sees the income column they care about.
      expect(params.fields).toContain('income');
    });

    it('unmappable order metric (epc) keeps field but drops order[]', () => {
      // epc / cr / ratio are computed fields — Affise can't sort by them.
      const params = toStatsParams(parseQuery('top 5 offers by epc last week'));
      expect(params.limit).toBe(5);
      expect(params.order).toBeUndefined();
      expect(params.fields).toContain('epc');
    });

    it('non-existent "top" form does not break parser', () => {
      const p = parseQuery('stats by affiliate last week');
      expect(p.limit).toBeUndefined();
      expect(p.order_by).toBeUndefined();
    });
  });
});

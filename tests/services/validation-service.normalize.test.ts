/**
 * Tests for ValidationService.normalizeStatsParams — covers the defensive
 * array coercion, partner/affiliate alias, nested filter flattening, and
 * the 6-month date-range guard.
 */

import { ValidationService } from '../../src/services/validation-service.js';

describe('ValidationService.normalizeStatsParams', () => {
  let v: ValidationService;

  beforeEach(() => {
    v = new ValidationService();
  });

  describe('array coercion', () => {
    it('keeps real arrays untouched', () => {
      const out = v.normalizeStatsParams({
        slice: ['day', 'country'],
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.slice).toEqual(['day', 'country']);
    });

    it('coerces numeric-keyed objects back to arrays for slice', () => {
      const out = v.normalizeStatsParams({
        slice: { 0: 'day', 1: 'country' } as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.slice).toEqual(['day', 'country']);
    });

    it('coerces numeric-keyed objects for fields and order', () => {
      const out = v.normalizeStatsParams({
        slice: ['day'],
        fields: { 0: 'clicks', 1: 'income' } as any,
        order: { 0: '-clicks' } as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.fields).toEqual(['clicks', 'income']);
      expect(out.order).toEqual(['-clicks']);
    });

    it('coerces filter keys: partner, sub1, sub8', () => {
      const out = v.normalizeStatsParams({
        slice: ['day'],
        partner: { 0: '193', 1: '194' } as any,
        sub1: { 0: 'abc' } as any,
        sub8: { 0: 'xyz' } as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.partner).toEqual(['193', '194']);
      expect(out.sub1).toEqual(['abc']);
      expect(out.sub8).toEqual(['xyz']);
    });

    it('coerces single string into a single-element array', () => {
      const out = v.normalizeStatsParams({
        slice: 'day' as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.slice).toEqual(['day']);
    });

    it('leaves empty object slice as-is (not converted to [])', () => {
      const out = v.normalizeStatsParams({
        slice: {} as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      // Normalizer falls through to default since empty object isn't a numeric-key map
      expect(out.slice).toEqual({});
    });
  });

  describe('legacy affiliate → partner alias', () => {
    it('renames top-level affiliate to partner', () => {
      const out = v.normalizeStatsParams({
        slice: ['day'],
        affiliate: ['193'],
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.partner).toEqual(['193']);
      expect(out.affiliate).toBeUndefined();
    });

    it('renames affiliate inside nested filter to partner', () => {
      const out = v.normalizeStatsParams({
        slice: ['day'],
        filter: { affiliate: { 0: '193' } } as any,
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      const f = out.filter as Record<string, unknown>;
      expect(f.partner).toEqual(['193']);
      expect(f.affiliate).toBeUndefined();
    });

    it('does not override existing partner with affiliate alias', () => {
      const out = v.normalizeStatsParams({
        slice: ['day'],
        partner: ['200'],
        affiliate: ['193'],
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(out.partner).toEqual(['200']);
    });
  });

  describe('date range guard (MAX_DATERANGE_MONTHS=6)', () => {
    it('passes when range is within 6 months', () => {
      expect(() => v.normalizeStatsParams({
        slice: ['day'],
        date_from: '2026-01-01',
        date_to: '2026-06-30',
      })).not.toThrow();
    });

    it('throws when range exceeds 6 months', () => {
      expect(() => v.normalizeStatsParams({
        slice: ['day'],
        date_from: '2026-01-01',
        date_to: '2026-08-01',
      })).toThrow(/6 months/);
    });
  });
});

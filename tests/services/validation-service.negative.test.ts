/**
 * Negative-case tests for ValidationService — guards against misuse and
 * regressions in the validation layer for affise_stats_raw inputs.
 */

import { ValidationService, STATS_RAW_FIELDS } from '../../src/services/validation-service.js';

describe('ValidationService.validateRawStatsParams — negative cases', () => {
  let v: ValidationService;

  beforeEach(() => {
    v = new ValidationService();
  });

  it('rejects unknown slice values', () => {
    const r = v.validateRawStatsParams({
      slice: ['day', 'definitely_not_a_slice'],
      date_from: '2026-01-01',
      date_to: '2026-01-10',
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Invalid slice values/);
  });

  it('rejects malformed date_from', () => {
    const r = v.validateRawStatsParams({
      slice: ['day'],
      date_from: '01/01/2026',
      date_to: '2026-01-10',
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/date_from|YYYY-MM-DD/i);
  });

  it('rejects date_from > date_to', () => {
    const r = v.validateRawStatsParams({
      slice: ['day'],
      date_from: '2026-05-10',
      date_to: '2026-05-01',
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/date_from must be before date_to/);
  });

  it('accepts every sub1..sub30 as a valid slice', () => {
    for (let i = 1; i <= 30; i++) {
      const r = v.validateRawStatsParams({
        slice: [`sub${i}`],
        date_from: '2026-01-01',
        date_to: '2026-01-10',
      });
      expect(r.isValid).toBe(true);
    }
  });

  it('accepts admin-only slices (advertiser, advertiser_manager_id) — Affise enforces role server-side', () => {
    const r = v.validateRawStatsParams({
      slice: ['advertiser', 'advertiser_manager_id'],
      date_from: '2026-01-01',
      date_to: '2026-01-10',
    });
    expect(r.isValid).toBe(true);
  });

  // Regression: the runtime field allow-list must stay in sync with the schema
  // enum advertised to clients. A stale hardcoded list previously rejected
  // schema-valid fields (earnings, payouts, noincome), forcing clients into
  // trial-and-error retries.
  it('accepts every field advertised in STATS_RAW_FIELDS', () => {
    for (const field of STATS_RAW_FIELDS) {
      const r = v.validateRawStatsParams({
        slice: ['os'],
        fields: [field],
        date_from: '2026-06-07',
        date_to: '2026-06-07',
      });
      expect(r.isValid, `field "${field}" should be valid: ${r.errors.join(', ')}`).toBe(true);
    }
  });

  it('accepts earnings + payouts + noincome together (real repro payload)', () => {
    const r = v.validateRawStatsParams({
      slice: ['os'],
      fields: ['clicks', 'conversions', 'cr', 'earnings', 'payouts', 'income', 'noincome'],
      date_from: '2026-06-07',
      date_to: '2026-06-07',
      partner: ['394'],
    });
    expect(r.isValid).toBe(true);
  });

  it('rejects an unknown field and lists valid values in the error', () => {
    const r = v.validateRawStatsParams({
      slice: ['os'],
      fields: ['clicks', 'totally_fake_metric'],
      date_from: '2026-06-07',
      date_to: '2026-06-07',
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Invalid field values: totally_fake_metric/);
    expect(r.errors.join(' ')).toMatch(/Valid values:.*earnings/);
  });

  it('rejects clicks_earnings/clicks_income (legacy export fields, not /3.0 input)', () => {
    const r = v.validateRawStatsParams({
      slice: ['os'],
      fields: ['clicks', 'clicks_earnings'],
      date_from: '2026-06-07',
      date_to: '2026-06-07',
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Invalid field values: clicks_earnings/);
  });

  it('rejects limit > 500', () => {
    const r = v.validateRawStatsParams({
      slice: ['day'],
      date_from: '2026-01-01',
      date_to: '2026-01-10',
      limit: 9999,
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Limit must be an integer between 1 and 500/);
  });
});

describe('ValidationService.normalizeStatsParams — negative cases', () => {
  let v: ValidationService;

  beforeEach(() => {
    v = new ValidationService();
  });

  it('throws a clear error when date range > 6 months', () => {
    expect(() => v.normalizeStatsParams({
      slice: ['day'],
      date_from: '2026-01-01',
      date_to: '2026-08-15',
    })).toThrow(/6 months|MAX_DATERANGE_MONTHS/i);
  });

  it('does not throw for exactly 6 months', () => {
    expect(() => v.normalizeStatsParams({
      slice: ['day'],
      date_from: '2026-01-01',
      date_to: '2026-07-01',
    })).not.toThrow();
  });

  it('handles invalid date strings without throwing (Affise will reject)', () => {
    // Invalid dates are caught by validateRawStatsParams upstream; normalize
    // shouldn't crash on them either.
    expect(() => v.normalizeStatsParams({
      slice: ['day'],
      date_from: 'not-a-date',
      date_to: 'also-not-a-date',
    })).not.toThrow();
  });

  it('leaves arrays untouched when no coercion needed', () => {
    const out = v.normalizeStatsParams({
      slice: ['day', 'country'],
      fields: ['clicks'],
      date_from: '2026-01-01',
      date_to: '2026-01-10',
    });
    expect(out.slice).toEqual(['day', 'country']);
    expect(out.fields).toEqual(['clicks']);
  });

  it('preserves non-array filter primitives (e.g. nonzero, offer_tag)', () => {
    const out = v.normalizeStatsParams({
      slice: ['day'],
      date_from: '2026-01-01',
      date_to: '2026-01-10',
      nonzero: 1,
      offer_tag: 'promo',
    } as any);
    expect(out.nonzero).toBe(1);
    expect(out.offer_tag).toBe('promo');
  });
});

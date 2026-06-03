/**
 * Unit tests for stats-normalizer — order[] + fields[] canonicalization
 * for /3.0/stats/custom. Backstop against regressions in the friendly-alias
 * mapping shared by NL parser, presets, and direct affise_stats_raw callers.
 */

import { describe, it, expect } from 'vitest';
import { normalizeStatsOrder, normalizeStatsFields, METRIC_TO_ORDER_FIELD } from '../../src/utils/stats-normalizer.js';

describe('normalizeStatsOrder', () => {
  it('translates friendly metric names to canonical sort keys', () => {
    expect(normalizeStatsOrder(['earnings']).order).toEqual(['confirmed_earning']);
    expect(normalizeStatsOrder(['conversions']).order).toEqual(['total_count']);
    expect(normalizeStatsOrder(['income']).order).toEqual(['total_revenue']);
    expect(normalizeStatsOrder(['clicks']).order).toEqual(['raw']);
  });

  it('passes canonical names through unchanged (idempotent)', () => {
    expect(normalizeStatsOrder(['total_count', 'confirmed_count']).order)
      .toEqual(['total_count', 'confirmed_count']);
  });

  it('passes dimension names through (day, month, country, etc.)', () => {
    expect(normalizeStatsOrder(['day', 'month', 'country']).order)
      .toEqual(['day', 'month', 'country']);
  });

  it('drops unsortable computed metrics (cr, epc, ratio, ecpm)', () => {
    const r = normalizeStatsOrder(['cr', 'epc', 'earnings']);
    expect(r.order).toEqual(['confirmed_earning']);
    expect(r.dropped).toEqual(['cr', 'epc']);
  });

  it('handles empty/undefined input', () => {
    expect(normalizeStatsOrder(undefined)).toEqual({ order: [], dropped: [] });
    expect(normalizeStatsOrder([])).toEqual({ order: [], dropped: [] });
  });

  it('passes unknown values through (let Affise decide)', () => {
    expect(normalizeStatsOrder(['some_new_field']).order).toEqual(['some_new_field']);
  });

  it('exposes the raw map for callers that need direct access', () => {
    expect(METRIC_TO_ORDER_FIELD.earnings).toBe('confirmed_earning');
    expect(METRIC_TO_ORDER_FIELD.conversions).toBe('total_count');
  });
});

describe('normalizeStatsFields', () => {
  it('translates slang to canonical field names', () => {
    expect(normalizeStatsFields(['cost']).fields).toEqual(['income']);
    expect(normalizeStatsFields(['charge']).fields).toEqual(['income']);
    expect(normalizeStatsFields(['spend']).fields).toEqual(['income']);
    expect(normalizeStatsFields(['revenue']).fields).toEqual(['income']);
    expect(normalizeStatsFields(['earning']).fields).toEqual(['earnings']);
    expect(normalizeStatsFields(['impressions']).fields).toEqual(['views']);
  });

  it('does NOT remap `costs` — admin-only field; direct callers may want it', () => {
    expect(normalizeStatsFields(['costs']).fields).toEqual(['costs']);
  });

  it('dedupes after translation', () => {
    expect(normalizeStatsFields(['cost', 'income']).fields).toEqual(['income']);
    expect(normalizeStatsFields(['cost', 'charge', 'spend']).fields).toEqual(['income']);
  });

  it('reports which aliases were applied', () => {
    const r = normalizeStatsFields(['cost', 'clicks', 'revenue']);
    expect(r.aliased).toEqual([['cost', 'income'], ['revenue', 'income']]);
  });

  it('passes canonical names through unchanged', () => {
    expect(normalizeStatsFields(['clicks', 'income', 'conversions']).fields)
      .toEqual(['clicks', 'income', 'conversions']);
  });

  it('handles empty/undefined input', () => {
    expect(normalizeStatsFields(undefined)).toEqual({ fields: [], aliased: [] });
    expect(normalizeStatsFields([])).toEqual({ fields: [], aliased: [] });
  });

  it('passes unknown fields through', () => {
    expect(normalizeStatsFields(['new_metric']).fields).toEqual(['new_metric']);
  });
});

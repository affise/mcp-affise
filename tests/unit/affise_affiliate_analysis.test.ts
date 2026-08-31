/**
 * Unit tests for getAffiliateAnalysis — composite fan-out over
 * stats-by-offer + trafficback + partner detail, plus the pure
 * KPI/insight builders.
 */

import { vi, Mock } from 'vitest';

vi.mock('../../src/tools/affise_custom_stats.js', () => ({ getAffiseCustomStats: vi.fn() }));
vi.mock('../../src/tools/affise_trafficback.js', () => ({ getTrafficbackStats: vi.fn() }));
vi.mock('../../src/tools/affise_partners.js', () => ({ getPartner: vi.fn() }));

import { getAffiseCustomStats } from '../../src/tools/affise_custom_stats.js';
import { getTrafficbackStats } from '../../src/tools/affise_trafficback.js';
import { getPartner } from '../../src/tools/affise_partners.js';
import {
  getAffiliateAnalysis,
  buildOfferBreakdown,
  buildTrafficbackBreakdown,
  buildInsights,
} from '../../src/tools/affise_affiliate_analysis.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

const STATS_GRID = {
  columns: [
    'slice.offer.id', 'slice.offer.title', 'traffic.raw',
    'actions.total.count', 'actions.confirmed.count', 'actions.declined.count',
    'actions.confirmed.earning', 'cr.confirmed',
  ],
  rows: [
    [1085, 'CashApp_MX_AOS_CPA', '35136100', 11000, 10910, 90, 61.1, 0.01],
    [1079, 'QuickBite_MY_AOS_CPA', '41500', 925, 439, 486, 181.2, 2.23],
    [1078, 'MegaShop_CL_CPI', '9800', 560, 559, 1, 222.4, 5.7],
  ],
  total: 3, page: 1, per_page: 100,
};

const TB_GRID = {
  columns: ['trafficback_reason', 'trafficback'],
  rows: [
    ['overcap', '36200000'],
    ['mistargeting-country', '308000'],
    ['mistargeting-os', '146000'],
    ['inactive-offer', '31000'],
  ],
};

function mockAll(overrides: Partial<Record<'stats' | 'tb' | 'partner', any>> = {}) {
  (getAffiseCustomStats as Mock).mockResolvedValue(
    overrides.stats ?? { status: 'ok', message: 'ok', data: STATS_GRID },
  );
  (getTrafficbackStats as Mock).mockResolvedValue(
    overrides.tb ?? { status: 'ok', message: 'ok', data: TB_GRID, metadata: {} },
  );
  (getPartner as Mock).mockResolvedValue(
    overrides.partner ?? { status: 'ok', message: 'ok', data: { partner: { id: 3554, login: 'quanta_media', status: 'active', api_key: 'SECRET' } } },
  );
}

beforeEach(() => {
  (getAffiseCustomStats as Mock).mockReset();
  (getTrafficbackStats as Mock).mockReset();
  (getPartner as Mock).mockReset();
});

describe('getAffiliateAnalysis — happy path', () => {
  it('fans out all three pulls and assembles KPIs, offers, trafficback, insights', async () => {
    mockAll();
    const r = await getAffiliateAnalysis(CFG, { partner_id: 3554, period: 'last30days' });

    expect(r.status).toBe('ok');
    expect(r.data.kpis).toEqual({
      confirmed_conversions: 10910 + 439 + 559,
      confirmed_earnings: 61.1 + 181.2 + 222.4,
      active_offers: 3,
      trafficback_total: 36200000 + 308000 + 146000 + 31000,
    });
    expect(r.data.offers[0].title).toBe('CashApp_MX_AOS_CPA');
    expect(r.data.trafficback.reasons[0]).toMatchObject({ reason: 'overcap', count: 36200000 });
    expect(r.data.partner).toEqual({ id: 3554, login: 'quanta_media', status: 'active' });
    expect(JSON.stringify(r.data)).not.toContain('SECRET');
    expect(r.metadata.data_pulls).toHaveLength(3);
  });

  it('passes the partner filter and resolved dates to the stats pull without order[]', async () => {
    mockAll();
    await getAffiliateAnalysis(CFG, { partner_id: 7, date_from: '2026-06-01', date_to: '2026-06-30' });
    const statsArgs = (getAffiseCustomStats as Mock).mock.calls[0][1];
    expect(statsArgs.partner).toEqual(['7']);
    expect(statsArgs.date_from).toBe('2026-06-01');
    expect(statsArgs.date_to).toBe('2026-06-30');
    expect(statsArgs.slice).toEqual(['offer']);
    expect(statsArgs.order).toBeUndefined();
  });
});

describe('getAffiliateAnalysis — tenant fallback (offer-slice × partner filter returns empty)', () => {
  const DAY_GRID = {
    columns: ['slice.day', 'traffic.raw', 'actions.confirmed.count', 'actions.confirmed.earning'],
    rows: [
      [1, '3658848', 115, 30],
      [2, '3100200', 98, 25.5],
    ],
  };

  it('falls back to day-slice totals and reports the degradation', async () => {
    mockAll({ tb: { status: 'ok', message: 'ok', data: { columns: [], rows: [] }, metadata: {} } });
    (getAffiseCustomStats as Mock)
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: { columns: [], rows: [], total: 0 } })
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: DAY_GRID });

    const r = await getAffiliateAnalysis(CFG, { partner_id: 3148 });

    expect(r.status).toBe('ok');
    expect(r.data.kpis.confirmed_conversions).toBe(115 + 98);
    expect(r.data.kpis.confirmed_earnings).toBeCloseTo(55.5, 2);
    expect(r.data.kpis.active_offers).toBeNull();
    expect(r.data.offers).toEqual([]);
    expect(r.metadata.degraded.join('\n')).toMatch(/per-offer breakdown unavailable/);
    expect(r.metadata.degraded.join('\n')).toMatch(/trafficback breakdown may be unavailable/);
    const daySliceArgs = (getAffiseCustomStats as Mock).mock.calls[1][1];
    expect(daySliceArgs.slice).toEqual(['day']);
    expect(daySliceArgs.partner).toEqual(['3148']);
  });

  it('does not fire the zero-conversions insight when day totals show volume', async () => {
    mockAll({ tb: { status: 'ok', message: 'ok', data: { columns: [], rows: [] }, metadata: {} } });
    (getAffiseCustomStats as Mock)
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: { columns: [], rows: [], total: 0 } })
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: DAY_GRID });

    const r = await getAffiliateAnalysis(CFG, { partner_id: 3148 });
    expect(r.data.insights.some((i: any) => /No confirmed conversions/.test(i.text))).toBe(false);
  });

  it('keeps the genuinely-empty result (no fallback data) with the zero-conversions warning', async () => {
    mockAll({ tb: { status: 'ok', message: 'ok', data: { columns: [], rows: [] }, metadata: {} } });
    (getAffiseCustomStats as Mock)
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: { columns: [], rows: [], total: 0 } })
      .mockResolvedValueOnce({ status: 'ok', message: 'ok', data: { columns: [], rows: [] } });

    const r = await getAffiliateAnalysis(CFG, { partner_id: 42 });
    expect(r.data.kpis.confirmed_conversions).toBe(0);
    expect(r.data.kpis.active_offers).toBe(0);
    expect(r.metadata.degraded).toBeUndefined();
    expect(r.data.insights.some((i: any) => /No confirmed conversions/.test(i.text))).toBe(true);
  });
});

describe('getAffiliateAnalysis — degraded modes', () => {
  it('fails hard when the stats pull fails', async () => {
    mockAll({ stats: { status: 'error', message: 'boom' } });
    const r = await getAffiliateAnalysis(CFG, { partner_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/stats pull.*boom/);
  });

  it('degrades gracefully when trafficback or partner detail fail', async () => {
    mockAll({
      tb: { status: 'error', message: 'tb down' },
      partner: { status: 'error', message: 'p down' },
    });
    const r = await getAffiliateAnalysis(CFG, { partner_id: 3554 });
    expect(r.status).toBe('ok');
    expect(r.data.trafficback.total).toBe(0);
    expect(r.data.partner).toEqual({ id: 3554, login: null, status: null });
    expect(r.metadata.degraded).toHaveLength(2);
  });

  it('rejects a missing / non-positive partner_id without calling the API', async () => {
    mockAll();
    for (const bad of [0, -5, 1.5, undefined]) {
      const r = await getAffiliateAnalysis(CFG, { partner_id: bad as any });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/partner_id/);
    }
    expect((getAffiseCustomStats as Mock).mock.calls.length).toBe(0);
  });
});

describe('buildOfferBreakdown', () => {
  it('computes decline_rate and sorts by confirmed desc', () => {
    const offers = buildOfferBreakdown(STATS_GRID as any);
    expect(offers.map(o => o.title)).toEqual([
      'CashApp_MX_AOS_CPA', 'MegaShop_CL_CPI', 'QuickBite_MY_AOS_CPA',
    ]);
    const quickbite = offers.find(o => o.title === 'QuickBite_MY_AOS_CPA')!;
    expect(quickbite.decline_rate).toBeCloseTo((486 / (439 + 486)) * 100, 1);
  });

  it('returns [] for a missing or empty grid', () => {
    expect(buildOfferBreakdown(null)).toEqual([]);
    expect(buildOfferBreakdown({ columns: [], rows: [] })).toEqual([]);
  });
});

describe('buildTrafficbackBreakdown', () => {
  it('aggregates counts by reason with shares', () => {
    const tb = buildTrafficbackBreakdown(TB_GRID as any);
    expect(tb.total).toBe(36685000);
    expect(tb.reasons[0].reason).toBe('overcap');
    expect(tb.reasons[0].share).toBeGreaterThan(98);
  });

  it('falls back to analysis_summary when the grid has no rows', () => {
    const tb = buildTrafficbackBreakdown(null, { total_trafficback: 500, top_reasons: ['overcap'] });
    expect(tb.total).toBe(500);
    expect(tb.reasons[0].reason).toBe('overcap');
  });
});

describe('buildInsights', () => {
  it('flags overcap domination, high decline rate, and scale candidates', () => {
    const offers = buildOfferBreakdown(STATS_GRID as any);
    const tb = buildTrafficbackBreakdown(TB_GRID as any);
    const insights = buildInsights(offers, tb, { confirmed_conversions: 11908, confirmed_earnings: 465 });

    const texts = insights.map(i => i.text).join('\n');
    expect(texts).toMatch(/overcap/);
    expect(texts).toMatch(/QuickBite_MY_AOS_CPA.*decline rate/);
    expect(texts).toMatch(/mistargeting/);
    expect(insights.some(i => i.severity === 'action')).toBe(true);
    expect(insights.some(i => i.severity === 'info')).toBe(true);
  });

  it('warns when there are zero confirmed conversions', () => {
    const insights = buildInsights([], { total: 0, reasons: [] }, { confirmed_conversions: 0, confirmed_earnings: 0 });
    expect(insights.some(i => /No confirmed conversions/.test(i.text))).toBe(true);
  });
});

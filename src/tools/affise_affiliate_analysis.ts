/**
 * Composite affiliate analysis — one call fans out to:
 *   1. /3.0/stats/custom        (slice=offer, filtered to the affiliate)
 *   2. /3.0/stats/trafficback   (filtered to the affiliate)
 *   3. /3.0/admin/partner/{id}  (login/status for the header)
 * then computes account KPIs, a per-offer breakdown, a trafficback reason
 * split, and deterministic rule-based insights. The result feeds the
 * affiliate-analysis MCP-UI widget; free-form recommendations stay with the
 * model in chat.
 *
 * NOTE: no `order[]` is sent to /stats/custom — sorting by revenue keys 500s
 * on some tenants (see the 2026-07-07 bisect); offers are sorted client-side.
 */

import { getAffiseCustomStats } from './affise_custom_stats.js';
import { getTrafficbackStats } from './affise_trafficback.js';
import { getPartner } from './affise_partners.js';
import { getCurrentTimestamp, getDateRange, DatePeriod } from '../shared/date-utils.js';

export interface AffiliateAnalysisParams {
  partner_id: number;
  date_from?: string;
  date_to?: string;
  period?: string;
  limit?: number;
}

export interface AffiliateAnalysisResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  metadata?: any;
  timestamp: string;
}

interface Grid {
  columns: string[];
  rows: any[][];
  total?: number;
}

function gridToObjects(grid: Grid | undefined | null): Record<string, any>[] {
  if (!grid || !Array.isArray(grid.columns) || !Array.isArray(grid.rows)) return [];
  return grid.rows.map(row => {
    const obj: Record<string, any> = {};
    grid.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function num(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface OfferBreakdownRow {
  id: number | string | null;
  title: string;
  clicks: number;
  total_conversions: number;
  confirmed: number;
  declined: number;
  confirmed_earning: number;
  cr: number;
  decline_rate: number;
}

export function buildOfferBreakdown(statsGrid: Grid | undefined | null): OfferBreakdownRow[] {
  const rows = gridToObjects(statsGrid);
  const offers = rows.map(r => {
    const confirmed = num(r['actions.confirmed.count']);
    const declined = num(r['actions.declined.count']);
    const judged = confirmed + declined;
    return {
      id: r['slice.offer.id'] ?? null,
      title: String(r['slice.offer.title'] ?? r['slice.offer.id'] ?? 'unknown'),
      clicks: num(r['traffic.raw']),
      total_conversions: num(r['actions.total.count']),
      confirmed,
      declined,
      confirmed_earning: round2(num(r['actions.confirmed.earning'])),
      cr: num(r['cr.confirmed'] ?? r['cr.total']),
      decline_rate: judged > 0 ? round2((declined / judged) * 100) : 0,
    };
  });
  offers.sort((a, b) => b.confirmed - a.confirmed || b.clicks - a.clicks);
  return offers;
}

export interface TrafficbackReason {
  reason: string;
  count: number;
  share: number;
}

export function buildTrafficbackBreakdown(
  tbGrid: Grid | undefined | null,
  fallbackSummary?: { total_trafficback?: number; top_reasons?: string[] },
): { total: number; reasons: TrafficbackReason[] } {
  const rows = gridToObjects(tbGrid);
  const byReason = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const reason = String(r['trafficback_reason'] ?? r['reason'] ?? 'unknown');
    const count = num(r['trafficback']);
    byReason.set(reason, (byReason.get(reason) ?? 0) + count);
    total += count;
  }
  if (total === 0 && fallbackSummary?.total_trafficback) {
    return {
      total: fallbackSummary.total_trafficback,
      reasons: (fallbackSummary.top_reasons ?? []).map(reason => ({ reason, count: 0, share: 0 })),
    };
  }
  const reasons = [...byReason.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      share: total > 0 ? round2((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return { total, reasons };
}

export function buildKpisFromDayGrid(dayGrid: Grid | undefined | null): {
  confirmed_conversions: number;
  confirmed_earnings: number;
  clicks: number;
} {
  const rows = gridToObjects(dayGrid);
  return {
    confirmed_conversions: rows.reduce((s, r) => s + num(r['actions.confirmed.count']), 0),
    confirmed_earnings: round2(rows.reduce((s, r) => s + num(r['actions.confirmed.earning']), 0)),
    clicks: rows.reduce((s, r) => s + num(r['traffic.raw']), 0),
  };
}

export interface Insight {
  severity: 'info' | 'warn' | 'action';
  text: string;
}

export function buildInsights(
  offers: OfferBreakdownRow[],
  trafficback: { total: number; reasons: TrafficbackReason[] },
  kpis: { confirmed_conversions: number; confirmed_earnings: number },
): Insight[] {
  const insights: Insight[] = [];

  const overcap = trafficback.reasons.find(r => r.reason === 'overcap');
  if (overcap && overcap.share >= 80) {
    insights.push({
      severity: 'action',
      text: `${overcap.share}% of ${formatCount(trafficback.total)} trafficback clicks are "overcap" — traffic is hitting capped offers. This is a caps/volume-allocation problem, not partner quality. Consider raising caps or rebalancing volume.`,
    });
  }
  const mistarget = trafficback.reasons.filter(r => r.reason.startsWith('mistargeting'));
  const mistargetTotal = mistarget.reduce((s, r) => s + r.count, 0);
  if (mistargetTotal > 100_000) {
    insights.push({
      severity: 'warn',
      text: `${formatCount(mistargetTotal)} clicks rejected for mistargeting (${mistarget.map(r => r.reason.replace('mistargeting-', '')).join(', ')}) — the partner's geo/OS targeting does not match offer targeting.`,
    });
  }

  for (const o of offers.slice(0, 10)) {
    if (o.decline_rate >= 40 && o.declined >= 50) {
      insights.push({
        severity: 'action',
        text: `"${o.title}": ${o.decline_rate}% decline rate (${o.declined} declined vs ${o.confirmed} confirmed) — audit the goal and targeting rules driving the rejects before scaling.`,
      });
    }
  }

  const volumeNoQuality = offers.filter(o => o.clicks >= 100_000 && o.cr > 0 && o.cr < 0.1);
  for (const o of volumeNoQuality.slice(0, 3)) {
    insights.push({
      severity: 'warn',
      text: `"${o.title}": high volume (${formatCount(o.clicks)} clicks) at ${o.cr}% CR — volume without quality; candidate to cap or cut.`,
    });
  }

  const scaleCandidates = offers
    .filter(o => o.cr >= 1 && o.confirmed >= 10 && o.decline_rate < 40)
    .sort((a, b) => b.cr - a.cr);
  for (const o of scaleCandidates.slice(0, 2)) {
    insights.push({
      severity: 'info',
      text: `"${o.title}" converts best (${o.cr}% CR, ${o.confirmed} confirmed) — low-risk candidate to scale with this partner.`,
    });
  }

  if (kpis.confirmed_conversions === 0) {
    insights.push({
      severity: 'warn',
      text: 'No confirmed conversions in the period — check whether the partner is active and offers are available to them, or whether the API key you authenticated with is allowed to see per-affiliate statistics.',
    });
  }

  return insights;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${round2(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export async function getAffiliateAnalysis(
  config: { baseUrl: string; apiKey: string },
  params: AffiliateAnalysisParams,
): Promise<AffiliateAnalysisResult> {
  if (!config?.baseUrl || !config?.apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!Number.isInteger(params.partner_id) || params.partner_id <= 0) {
    return {
      status: 'error',
      message: 'partner_id is required and must be a positive integer (resolve logins via affise_list_partners first)',
      timestamp: getCurrentTimestamp(),
    };
  }

  let dateFrom = params.date_from;
  let dateTo = params.date_to;
  if (!dateFrom || !dateTo) {
    const range = getDateRange((params.period ?? 'last30days') as DatePeriod);
    dateFrom = range.from;
    dateTo = range.to;
  }
  const partnerFilter = [String(params.partner_id)];

  const [statsResult, tbResult, partnerResult] = await Promise.all([
    getAffiseCustomStats(config, {
      slice: ['offer'],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['clicks', 'conversions', 'earnings', 'cr'],
      partner: partnerFilter,
      limit: Math.min(params.limit ?? 100, 500),
      page: 1,
    } as any),
    getTrafficbackStats(config, {
      date_from: dateFrom,
      date_to: dateTo,
      partner: partnerFilter,
      limit: 500,
      page: 1,
    } as any),
    getPartner(config, { partner_id: params.partner_id }),
  ]);

  if (statsResult.status === 'error') {
    return {
      status: 'error',
      message: `Affiliate analysis failed on the stats pull: ${statsResult.message}`,
      timestamp: getCurrentTimestamp(),
    };
  }

  const degraded: string[] = [];
  const offers = buildOfferBreakdown(statsResult.data);
  let activeOffers: number | null = offers.length;
  let dayTotals: ReturnType<typeof buildKpisFromDayGrid> | null = null;

  // Some tenants return an empty set for entity slices (offer/affiliate)
  // combined with an entity filter — the same query sliced by day works.
  // Probed 2026-07-07: slice=offer + filter[partner] → 0 rows, slice=day +
  // filter[partner] → data. Fall back to day-slice totals so the KPIs stay
  // honest, and report the missing breakdown instead of implying zero volume.
  if (offers.length === 0) {
    const dayResult = await getAffiseCustomStats(config, {
      slice: ['day'],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['clicks', 'conversions', 'earnings'],
      partner: partnerFilter,
      limit: 100,
      page: 1,
    } as any);
    if (dayResult.status === 'ok') {
      dayTotals = buildKpisFromDayGrid(dayResult.data);
      if (dayTotals.confirmed_conversions > 0 || dayTotals.clicks > 0) {
        activeOffers = null;
        degraded.push(
          'per-offer breakdown unavailable: this tenant returns an empty set for offer-slice stats filtered by partner; KPIs computed from day-slice totals instead'
        );
      }
    }
  }

  const trafficback = buildTrafficbackBreakdown(
    tbResult.status === 'ok' ? (tbResult.data as unknown as Grid) : null,
    (tbResult as any).metadata?.analysis_summary,
  );
  if (trafficback.total === 0 && dayTotals && dayTotals.clicks > 0) {
    degraded.push(
      'trafficback breakdown may be unavailable: this tenant returns an empty set for trafficback filtered by partner'
    );
  }

  const kpis = {
    confirmed_conversions: dayTotals
      ? dayTotals.confirmed_conversions
      : offers.reduce((s, o) => s + o.confirmed, 0),
    confirmed_earnings: dayTotals
      ? dayTotals.confirmed_earnings
      : round2(offers.reduce((s, o) => s + o.confirmed_earning, 0)),
    active_offers: activeOffers,
    trafficback_total: trafficback.total,
  };

  const insights = buildInsights(offers, trafficback, {
    confirmed_conversions: kpis.confirmed_conversions,
    confirmed_earnings: kpis.confirmed_earnings,
  });

  const rawPartner = partnerResult.status === 'ok' ? partnerResult.data?.partner : null;
  const partner = {
    id: params.partner_id,
    login: rawPartner?.login ?? rawPartner?.name ?? null,
    status: rawPartner?.status ?? null,
  };

  if (tbResult.status === 'error') degraded.push(`trafficback: ${tbResult.message}`);
  if (partnerResult.status === 'error') degraded.push(`partner detail: ${partnerResult.message}`);

  return {
    status: 'ok',
    message: `Affiliate analysis for partner ${params.partner_id} (${dateFrom} to ${dateTo})`,
    data: {
      partner,
      period: { date_from: dateFrom, date_to: dateTo },
      kpis,
      offers: offers.slice(0, 20),
      trafficback,
      insights,
    },
    metadata: {
      data_pulls: ['stats by offer', 'trafficback', 'partner detail'],
      ...(degraded.length ? { degraded } : {}),
    },
    timestamp: getCurrentTimestamp(),
  };
}

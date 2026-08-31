/**
 * Period-over-period stats comparison with auto range-alignment.
 *
 * Runs /3.0/stats/custom twice — once for the current range, once for a
 * baseline range of the SAME length (see utils/period-align) — aggregates
 * each to period totals, and returns per-metric deltas. This is what makes
 * "how did the network do this month vs last?" honest: month-to-date is
 * compared against the same day-range of the prior month, not a full month.
 */

import { getAffiseCustomStats } from './affise_custom_stats.js';
import { alignedRanges, precedingWindow } from '../utils/period-align.js';
import { DatePeriod, DateRange, getCurrentTimestamp, daysBetween, parseDateString } from '../shared/date-utils.js';

const DEFAULT_FIELDS = ['clicks', 'conversions', 'income', 'trafficback'];

// Flat filter keys forwarded to getAffiseCustomStats (Filter.php form).
const FILTER_KEYS = [
  'partner', 'affiliate', 'supplier', 'advertiser', 'manager',
  'advertiser_manager_id', 'affiliate_manager_id', 'offer', 'smart_id',
  'country', 'city', 'currency', 'os', 'device', 'goal', 'payment_status',
  'subaccount_id', 'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
  'offer_tag', 'affiliate_tag', 'advertiser_tag',
];

export interface CompareStatsParams {
  period?: DatePeriod;
  date_from?: string;
  date_to?: string;
  fields?: string[];
  filter?: Record<string, any>;
  includeToday?: boolean;
  timezone?: string;
}

export interface CompareResult {
  status: 'ok' | 'error';
  message: string;
  data?: {
    period?: DatePeriod;
    current: { range: DateRange; totals: Record<string, number> };
    baseline: { range: DateRange; totals: Record<string, number> };
    delta: Record<string, { current: number; baseline: number; abs?: number; pct?: number | null; pp?: number }>;
    partial: boolean;
    note: string;
  };
  timestamp: string;
}

const isRatio = (k: string) => /^cr\./.test(k) || k === 'epc' || k === 'ratio' || k === 'affiliate_epc';

/** Sum additive columns across the daily rows; recompute conversion rates. */
function aggregate(data: any): Record<string, number> {
  const cols = data?.columns;
  const rows = data?.rows;
  const totals: Record<string, number> = {};
  if (!Array.isArray(cols) || !Array.isArray(rows)) return totals;

  cols.forEach((c: any, i: number) => {
    if (typeof c !== 'string' || c.startsWith('slice.')) return;
    if (/^(cr\.|epc|ratio|ctr|ecpm|afprice|affiliate_epc)/i.test(c)) return; // ratios: recomputed, not summed
    let sum = 0;
    let any = false;
    for (const r of rows) {
      const v = Number(r?.[i]);
      if (Number.isFinite(v)) { sum += v; any = true; }
    }
    if (any) totals[c] = Math.round(sum * 1e6) / 1e6;
  });

  const clicks = totals['traffic.raw'];
  if (clicks) {
    if (totals['actions.total.count'] != null) {
      totals['cr.total'] = Math.round(totals['actions.total.count'] / clicks * 100 * 1000) / 1000;
    }
    if (totals['actions.confirmed.count'] != null) {
      totals['cr.confirmed'] = Math.round(totals['actions.confirmed.count'] / clicks * 100 * 1000) / 1000;
    }
  }
  return totals;
}

function computeDelta(cur: Record<string, number>, base: Record<string, number>) {
  const out: Record<string, any> = {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(base)]);
  for (const k of keys) {
    const c = cur[k] ?? 0;
    const b = base[k] ?? 0;
    if (isRatio(k)) {
      out[k] = { current: c, baseline: b, pp: Math.round((c - b) * 1000) / 1000 };
    } else {
      out[k] = {
        current: c,
        baseline: b,
        abs: Math.round((c - b) * 1e6) / 1e6,
        pct: b === 0 ? null : Math.round(((c - b) / b) * 100 * 100) / 100,
      };
    }
  }
  return out;
}

export async function compareStats(
  config: { baseUrl: string; apiKey: string },
  params: CompareStatsParams,
): Promise<CompareResult> {
  if (!config?.baseUrl || !config?.apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  // Resolve current + baseline ranges.
  let current: DateRange;
  let baseline: DateRange;
  let partial = false;
  let note: string;

  if (params.date_from && params.date_to) {
    current = { from: params.date_from, to: params.date_to };
    baseline = precedingWindow(current);
    const cd = daysBetween(parseDateString(current.from), parseDateString(current.to));
    const bd = daysBetween(parseDateString(baseline.from), parseDateString(baseline.to));
    note = `current = ${current.from}…${current.to} (${cd} day${cd === 1 ? '' : 's'}); ` +
      `baseline aligned to ${baseline.from}…${baseline.to} (${bd} day${bd === 1 ? '' : 's'})`;
  } else {
    const period = params.period ?? 'thismonth';
    const a = alignedRanges(period, { includeToday: params.includeToday ?? true });
    current = a.current;
    baseline = a.baseline;
    partial = a.partial;
    note = a.note;
  }

  const fields = params.fields?.length ? params.fields : DEFAULT_FIELDS;
  const filter: Record<string, any> = {};
  if (params.filter && typeof params.filter === 'object') {
    for (const k of FILTER_KEYS) {
      if (params.filter[k] !== undefined) filter[k] = params.filter[k];
    }
  }

  const runFor = (range: DateRange) => getAffiseCustomStats(config, {
    slice: ['day'] as any,
    date_from: range.from,
    date_to: range.to,
    fields: fields as any,
    limit: 400,
    ...filter,
  } as any);

  try {
    const [curRes, baseRes] = await Promise.all([runFor(current), runFor(baseline)]);
    if (curRes.status === 'error') {
      return { status: 'error', message: `Current range failed: ${curRes.message}`, timestamp: getCurrentTimestamp() };
    }
    if (baseRes.status === 'error') {
      return { status: 'error', message: `Baseline range failed: ${baseRes.message}`, timestamp: getCurrentTimestamp() };
    }

    const curTotals = aggregate(curRes.data);
    const baseTotals = aggregate(baseRes.data);

    return {
      status: 'ok',
      message: `Compared ${current.from}…${current.to} vs ${baseline.from}…${baseline.to}`,
      data: {
        period: params.period,
        current: { range: current, totals: curTotals },
        baseline: { range: baseline, totals: baseTotals },
        delta: computeDelta(curTotals, baseTotals),
        partial,
        note,
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return { status: 'error', message: `Comparison error: ${error?.message ?? String(error)}`, timestamp: getCurrentTimestamp() };
  }
}

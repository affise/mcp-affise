/**
 * Normalization helpers for /3.0/stats/custom params.
 *
 * Affise's `order[]` vocabulary differs from `fields[]`. Callers (presets,
 * NL parser, direct affise_stats_raw users) often pass friendly names like
 * "earnings" or "conversions" in `order[]` — Affise rejects those with 403
 * "insufficient permissions for custom stats API". This module translates
 * friendly names to canonical sort keys before the request is built.
 *
 * Reference: /3.0/stats/custom `order` param accepts:
 *   hour, month, quarter, year, day, currency, offer, country, city,
 *   os, os_version, device, device_model, browser, goal, sub1..sub30,
 *   confirmed_earning, raw, uniq,
 *   total_count, total_revenue, total_null,
 *   pending_count, pending_revenue,
 *   declined_count, declined_revenue,
 *   hold_count, hold_revenue,
 *   confirmed_count, confirmed_revenue
 *   (admin only: advertiser, affiliate, manager)
 *
 * Direction goes in a SEPARATE `orderType: asc|desc` param — do NOT prefix `-`.
 */

/**
 * Map friendly metric names (as used in fields[]) → canonical order[] keys.
 * Unmapped computed metrics (epc, cr, ratio, ecpm, roi, margin) are NOT
 * sortable in Affise and get dropped by normalizeStatsOrder().
 */
export const METRIC_TO_ORDER_FIELD: Record<string, string> = {
  income: 'total_revenue',
  costs: 'total_revenue',
  conversions: 'total_count',
  conversions_confirmed: 'confirmed_count',
  conversions_pending: 'pending_count',
  conversions_declined: 'declined_count',
  conversions_hold: 'hold_count',
  clicks: 'raw',
  views: 'uniq',
  earnings: 'confirmed_earning',
  payouts: 'total_revenue',
};

const UNSORTABLE_COMPUTED = new Set([
  'epc', 'cr', 'ratio', 'ecpm', 'roi', 'margin',
  'affiliate_epc', 'ctr',
]);

/**
 * Map friendly field aliases → canonical Affise field names.
 *
 * Mirrors NL parser's extractMetrics() so direct affise_stats_raw callers
 * benefit from the same translation. Affise non-admin field whitelist:
 *   clicks, hosts, earnings, income, noincome, payouts, conversions, cr,
 *   affiliate_epc, ratio, epc, trafficback, views, ecpm, ctr
 *
 * `costs` (admin-only) is INTENTIONALLY NOT remapped — direct callers may
 * legitimately request the admin field; only the unambiguous slang
 * (cost / charge / spend) is rewritten to `income`.
 */
const FIELD_ALIAS: Record<string, string> = {
  revenue: 'income',
  cost: 'income',
  charge: 'income',
  spend: 'income',
  earning: 'earnings',
  impressions: 'views',
};

export interface NormalizedOrder {
  order: string[];
  dropped: string[];
}

/**
 * Normalize order[] entries for /3.0/stats/custom.
 *
 * - friendly metric → canonical (`earnings` → `confirmed_earning`)
 * - canonical names → kept as-is (idempotent — `total_count` stays `total_count`)
 * - unsortable computed (cr/epc/ratio/ecpm/roi/margin) → dropped silently
 *   (Affise rejects them; we keep the field in `fields[]` so the column still shows)
 * - dimension names (day/month/country/etc.) → passed through
 * - unknown → passed through (let Affise decide — better signal than silent drop)
 */
export function normalizeStatsOrder(order: string[] | undefined): NormalizedOrder {
  if (!order?.length) return { order: [], dropped: [] };

  const out: string[] = [];
  const dropped: string[] = [];

  for (const raw of order) {
    if (!raw) continue;
    if (UNSORTABLE_COMPUTED.has(raw)) {
      dropped.push(raw);
      continue;
    }
    out.push(METRIC_TO_ORDER_FIELD[raw] ?? raw);
  }

  return { order: out, dropped };
}

export interface NormalizedFields {
  fields: string[];
  aliased: Array<[string, string]>;
}

/**
 * Normalize fields[] entries for /3.0/stats/custom.
 *
 * - friendly alias (`cost`, `charge`, `spend`, `revenue`, `earning`, `impressions`)
 *   → canonical Affise field name
 * - canonical names → unchanged
 * - deduped after translation (so ['cost', 'income'] → ['income'])
 * - unknown values → passed through (let Affise / field-validator decide)
 */
export function normalizeStatsFields(fields: string[] | undefined): NormalizedFields {
  if (!fields?.length) return { fields: [], aliased: [] };

  const out: string[] = [];
  const seen = new Set<string>();
  const aliased: Array<[string, string]> = [];

  for (const raw of fields) {
    if (!raw) continue;
    const canonical = FIELD_ALIAS[raw] ?? raw;
    if (canonical !== raw) aliased.push([raw, canonical]);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }

  return { fields: out, aliased };
}

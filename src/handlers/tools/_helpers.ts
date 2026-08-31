/**
 * Helpers shared across per-tool handlers.
 *
 * Kept tiny on purpose — anything that grows past a few lines should go
 * into its own module (e.g. response shaping into utils/compact-response).
 */

import type { OfferCard } from '../../types/api-responses.js';

/**
 * Roll up a stats response's row array into a quick totals summary. Used by
 * handleStatsNL and handleStatsRaw to attach `summary` to their CallToolResult
 * for clients that don't paginate through the full row set themselves.
 */
export function calculateSummary(
  stats: any[]
): { total_records: number; key_metrics: Record<string, number> } {
  if (!stats || stats.length === 0) {
    return { total_records: 0, key_metrics: {} };
  }

  const totals = stats.reduce(
    (acc, stat) => {
      acc.revenue     += parseFloat(stat.income) || 0;
      acc.conversions += parseInt(stat.conversions) || 0;
      acc.clicks      += parseInt(stat.clicks) || 0;
      return acc;
    },
    { revenue: 0, conversions: 0, clicks: 0 }
  );

  return {
    total_records: stats.length,
    key_metrics: {
      total_revenue:     totals.revenue,
      total_conversions: totals.conversions,
      total_clicks:      totals.clicks,
      conversion_rate:   totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0,
    },
  };
}

/**
 * Project a full Affise offer down to the fields an offer card (and the
 * model's text summary) actually read.
 *
 * WHY: `/3.0/offers` returns ~8-10 KB per offer — the bulk is `landings[]`
 * (~5.6 KB) and the full `payments[]` table (~4 KB, 20+ keys each incl.
 * sub1..sub8, devices, cities). A 30-offer search is ~250 KB and a
 * smart-search (maxSampleSize 100) is far larger. That overflows the host's
 * inline tool-result budget, so the result gets offloaded to disk and the
 * caller receives a "too large" placeholder instead of the offers.
 *
 * The card needs only: title, numeric id, status/privacy, a one-line payout
 * (first payment's revenue/currency/type + count), country chips, category
 * chips, and CR/EPC. We keep `payments`/`partner_payments` as slim
 * {revenue, currency, type} entries (length preserved for the "+N" badge)
 * and drop `landings`, `os_targeting`, `url`. Net: ~700 B/offer (−91%).
 *
 * Full payout tables / landings stay one `affise_get_offer` call away.
 */
const slimPayments = (arr: unknown): Array<Record<string, unknown>> | undefined =>
  Array.isArray(arr)
    ? arr.map((p: any) => ({ revenue: p?.revenue, currency: p?.currency, type: p?.type }))
    : undefined;

export function toOfferCard(offer: any): OfferCard {
  if (!offer || typeof offer !== 'object') return offer;
  return {
    id:                offer.id,
    offer_id:          offer.offer_id,
    title:             offer.title,
    advertiser:        offer.advertiser,
    status:            offer.status,
    privacy:           offer.privacy,
    countries:         offer.countries,
    categories:        offer.categories,
    full_categories:   offer.full_categories,
    cr:                offer.cr,
    epc:               offer.epc,
    revenue:           offer.revenue,
    currency:          offer.currency,
    is_top:            offer.is_top,
    required_approval: offer.required_approval,
    payments:          slimPayments(offer.payments),
    partner_payments:  slimPayments(offer.partner_payments),
  };
}

/** Map an offers array through {@link toOfferCard}, tolerating non-arrays. */
export function toOfferCards(offers: unknown): OfferCard[] {
  return Array.isArray(offers) ? offers.map(toOfferCard) : [];
}

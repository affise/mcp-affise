/**
 * Conversions analysis prompt — companion to the affise_conversions_raw tool.
 *
 * Wraps raw conversion records (one row per event) with a structured
 * analysis template. Six lenses are supported via `analysis_type`:
 *
 *   - comprehensive   — overall conversion patterns across all dimensions
 *   - fraud_review    — fraud signals (fraud_risk_level/type, decline_reason,
 *                       IP duplicates, click→conversion timing anomalies)
 *   - attribution     — sub1..sub8 path analysis, referer, click_id chains,
 *                       click→conversion time distributions
 *   - partner_quality — per-partner CR, decline rates, payout efficiency
 *   - geo_tech        — country/city/ISP/OS/device/browser breakdowns
 *   - payouts         — revenue/payouts/earnings by partner/offer/status,
 *                       payment_status & currency mix
 *
 * Note: conversion record fields available (typical Affise /3.0/stats/conversions
 * response): id, conversion_id, action_id, status, currency, offer{}, offer_id,
 * goal, ip, country, city, isp_code, ua, browser, os, device, device_type,
 * click_time, created_at, sub1..sub8, custom_field_1..15, partner{},
 * fraud_risk_level, fraud_type, decline_reason, payouts, revenue, earnings,
 * payment_status, referrer.
 */

export type ConversionsAnalysisType =
  | 'comprehensive'
  | 'fraud_review'
  | 'attribution'
  | 'partner_quality'
  | 'geo_tech'
  | 'payouts';

export type ConversionsAnalysisFormat = 'summary' | 'detailed' | 'actionable';

export interface ConversionsAnalysisParams {
  /** JSON string of conversions data (e.g. response from affise_conversions_raw). */
  conversions_data: string;
  analysis_type?: ConversionsAnalysisType;
  focus_areas?: string[];
  comparison_criteria?: string;
  format?: ConversionsAnalysisFormat;
}

const FORMAT_INSTRUCTIONS: Record<ConversionsAnalysisFormat, string> = {
  summary:
    'Provide a concise summary highlighting only the top findings and patterns. Skip granular per-record detail.',
  detailed:
    'Provide a detailed analysis with concrete numbers, percentages, top-N lists, and supporting examples drawn from the data.',
  actionable:
    'Focus on specific, prioritized recommendations the operator can act on this week. Quantify expected impact where possible.',
};

const ANALYSIS_HEADERS: Record<ConversionsAnalysisType, string> = {
  comprehensive:
    'Conduct a comprehensive review of these conversions across status, geo, tech, partners, attribution paths, and financials.',
  fraud_review:
    'Conduct a fraud and quality review: flag suspicious conversions and patterns indicative of fraud, bot traffic, or quality issues.',
  attribution:
    'Conduct an attribution-path review: trace where conversions came from via sub1..sub8 chains, referer, and click-id linkage; flag broken or noisy attribution.',
  partner_quality:
    'Conduct a partner-quality review: compare partners side-by-side on conversion rate, decline rate, fraud rate, and payout efficiency.',
  geo_tech:
    'Conduct a geo/tech breakdown: where (country/city/ISP) and on what (OS/device/browser) these conversions are happening, and where there are mismatches with offer targeting.',
  payouts:
    'Conduct a financial review: revenue / payouts / earnings distribution across partners, offers, currencies, and statuses; surface margin issues and unpaid invoices.',
};

const ANALYSIS_TASKS: Record<ConversionsAnalysisType, string[]> = {
  comprehensive: [
    '**Overview**: total conversions, date range covered, status mix (confirmed / pending / declined / hold), top countries, top partners.',
    '**Status breakdown**: confirmed/pending/declined/hold counts and percentages, and what is moving the decline rate.',
    '**Top geo**: top 5–10 countries by volume and by confirmed CR; flag outliers.',
    '**Top partners / offers**: top 5 partners and top 5 offers by confirmed volume and revenue.',
    '**Tech mix**: device/OS/browser breakdown; mobile vs desktop split.',
    '**Sub-ID surface**: which sub1..sub8 fields are populated; high-cardinality patterns vs near-empty.',
    '**Anomalies**: any spikes, unusual statuses, suspicious clusters worth a closer look.',
    '**Recommendations**: 3–5 prioritized actions.',
  ],
  fraud_review: [
    '**Risk-level distribution**: counts by `fraud_risk_level`; share of suspicious / high-risk conversions.',
    '**Fraud types**: top `fraud_type` values and which partners/offers/geos they cluster around.',
    '**Decline reasons**: top `decline_reason` values; separate technical declines from fraud-driven ones.',
    '**Click→conversion timing**: distribution of (conversion_time − click_time); flag <1s (bot-like) and >24h (likely re-attribution) buckets.',
    '**IP duplication**: same IP firing multiple conversions in a short window; same IP + same `ua` repeated.',
    '**Sub-ID anomalies**: sub values repeating verbatim across distinct partners or offers (sign of leaked tracking).',
    '**Geo mismatch**: country in conversion vs offer geo targeting (when inferable from offer object/title).',
    '**Recommendations**: which partners/offers/geos to throttle, block, or audit. Suggest fraud filter rules.',
  ],
  attribution: [
    '**Sub-ID coverage**: which sub1..sub8 are populated and at what rate. Cross-reference with offer/partner.',
    '**Click→conversion linkage**: pair conversions to clicks via click_id / cbid where present. Note unmatched conversions.',
    '**Referer patterns**: top referrer hosts; flag missing/empty referrers and direct-traffic ratios.',
    '**Click-to-convert time**: distribution and median by partner/offer. Long tails (>1h) and instant (<1s) signals.',
    '**Sub-ID consistency**: same sub value appearing across different partners/offers? (May indicate shared placements or leaked tracking.)',
    '**Custom field usage**: which `custom_field_*` are present and what they encode (campaign id, creative, placement, etc.).',
    '**Recommendations**: tighten tracking macros, fix missing sub-ids, dedupe placements with consistent attribution.',
  ],
  partner_quality: [
    '**Partner ranking**: each partner with conversions count, confirmed %, declined %, fraud %, revenue, payout, earnings.',
    '**Top performers**: which partners convert profitably (high confirmed %, low fraud %, positive earnings).',
    '**Quality issues**: partners with high `fraud_risk_level`, high decline rate, or short click→conv times.',
    '**Geo concentration**: per-partner top countries; partners over-indexed on low-quality geos.',
    '**Offer mix**: which offers each top partner runs; volume vs CR trade-offs.',
    '**Payment health**: per-partner `payment_status` mix (paid / opened / pending) and unpaid revenue.',
    '**Recommendations**: top partners to grow, partners to audit, partners to pause.',
  ],
  geo_tech: [
    '**Country breakdown**: top countries by volume and by confirmed CR. Identify low-volume / high-CR niches.',
    '**City / region drilldown**: where geo data is granular, surface top cities and unusual geographic clusters.',
    '**ISP / connection**: top `isp_code` values; carrier vs WiFi if inferable.',
    '**OS / OS version**: split by OS and by OS major version. Note where confirmed CR varies materially.',
    '**Device / device model**: mobile vs desktop vs tablet. Top device models on mobile.',
    '**Browser**: top browsers; flag headless / outdated browser signals.',
    '**Geo-offer mismatch**: countries firing on offers that target other geos (when inferable).',
    '**Recommendations**: targeting refinements, suspect geo/tech combos to filter.',
  ],
  payouts: [
    '**Revenue mix**: total revenue and breakdown by currency, partner, offer, status.',
    '**Payouts vs revenue**: per-partner and per-offer margin (revenue − payouts) and ratio. Flag negative-margin clusters.',
    '**Confirmed earnings concentration**: top partners and offers by `earnings`; share of top-10 in total.',
    '**Status-driven losses**: revenue lost to `declined` / `hold` conversions; per-partner decline-revenue.',
    '**Payment status**: confirmed but unpaid (`payment_status` opened/pending); aging by `updated_at`.',
    '**Currency mix**: distribution by `currency`; note FX-driven margin risk if mixed.',
    '**Recommendations**: which payouts to renegotiate, which offers to scale, which to pause.',
  ],
};

export function createConversionsAnalysisPrompt(params: ConversionsAnalysisParams) {
  const {
    conversions_data,
    analysis_type = 'comprehensive',
    focus_areas = [],
    comparison_criteria,
    format = 'detailed',
  } = params;

  const header =
    ANALYSIS_HEADERS[analysis_type] ||
    `Perform a conversions analysis focused on: ${analysis_type}`;

  const tasks =
    ANALYSIS_TASKS[analysis_type] || ANALYSIS_TASKS.comprehensive;

  const tasksText = tasks
    .map((task, i) => `${i + 1}. ${task}`)
    .join('\n');

  const focusText =
    focus_areas.length > 0
      ? `\n\nFOCUS AREAS (apply extra scrutiny): ${focus_areas.join(', ')}`
      : '';

  const comparisonText = comparison_criteria
    ? `\n\nCOMPARISON: compare ${comparison_criteria}. Surface differences, correlations, and anomalies; suggest causes.`
    : '';

  const formatInstruction = FORMAT_INSTRUCTIONS[format];

  const prompt = `You are an expert affiliate-marketing analyst with deep familiarity with Affise raw conversion data (fields like ip, ua, country, status, sub1..sub8, fraud_risk_level, click_time, partner, offer, revenue, payouts).

${header}

CONVERSIONS DATA:
${conversions_data}

ANALYSIS TASKS:

${tasksText}${focusText}${comparisonText}

RESPONSE FORMAT: ${formatInstruction}

Cite concrete numbers from the data. Use clear headers and bullets. When you flag a partner / offer / pattern, identify it by id and name. When making a recommendation, explain the expected outcome and the trade-off.`;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: prompt,
        },
      },
    ],
  };
}

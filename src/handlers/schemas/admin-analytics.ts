/**
 * Schemas for the admin-analytics tools:
 *   - affise_stats_raw           (/3.0/stats/custom)
 *   - affise_stats_compare       (two /3.0/stats/custom pulls, range-aligned)
 *   - affise_trafficback         (/3.0/stats/trafficback)
 *   - affise_affiliate_analysis  (composite: stats-by-offer + trafficback + detail)
 *   - affise_retention_rate      (/3.0/stats/retentionrate)
 *   - affise_time_to_action      (/3.0/stats/time-to-action)
 */

import { z } from 'zod';
import {
  ORDER_TYPE_ENUM,
  LOCALE_ENUM,
  STATS_RAW_SLICE_ENUM,
  STATS_RAW_FIELDS_ENUM,
  CONVERSION_TYPE_ENUM,
  STARTS_WITH_LETTER_REGEX,
  TABULAR_OUTPUT_SCHEMA,
} from './_shared.js';

export const affise_stats_raw = {
  title: 'Affise Stats (Raw)',
  description:
    'Raw stats via Affise /3.0/stats/custom. Machine-readable limits live in `_meta` (affise/max_date_range_days, affise/sub_filter_cap, affise/admin_only_fields). What the description still has to say:\n' +
    '1. Filter ID types — MCP server auto-resolves names → IDs:\n' +
    '   - `filter.partner` / `affiliate` — numeric affiliate_id; pass e.g. "aff_demo" and we resolve via /3.0/admin/partners.\n' +
    '   - `filter.offer` — numeric offer_id; resolve names via affise_search_offers.\n' +
    '   - `filter.advertiser` / `supplier` — 24-char hex MongoID; pass a name and we resolve via /3.0/admin/advertisers.\n' +
    '2. `order[]` vocabulary differs from `fields[]`. Sort keys: total_revenue, total_count, total_null, raw, uniq, confirmed_earning/_count/_revenue, pending_count/_revenue, declined_count/_revenue, hold_count/_revenue (+admin: advertiser, affiliate, manager). NOT field names like "income" or "clicks".\n' +
    '3. Sort direction via `orderType` ("asc"|"desc"). DO NOT prefix order values with "-".\n' +
    '4. `costs` is also incompatible with os/sub*/geo slices server-side.\n' +
    '5. One call = one date range. For MULTIPLE ranges (e.g. week 1 vs week 2, or each month separately), call this tool once per range. Prefer this tool over affise_stats for non-English asks and for precise partner/sub-ID exports.',
  inputSchema: {
    slice: z.array(z.enum(STATS_RAW_SLICE_ENUM)).optional()
      .describe('Grouping dimensions per Affise API StatisticsEntity::getAllowedSliced(). `advertiser` and `manager` are admin-only. Sub IDs sub1..sub30 valid as slice (filter is capped at sub1..sub8). Note: `trafficback_reason` is ONLY compatible with `fields: ["trafficback"]` — conversion/traffic metrics are disabled server-side when this slice is present. Combine with other slices like `country`/`offer` to get drill-down (slice=["trafficback_reason","country"], fields=["trafficback"]).'),
    fields: z.array(z.enum(STATS_RAW_FIELDS_ENUM)).optional()
      .describe('Metrics to include, matching Affise API CustomStat::getGoApiFields() (what /3.0/stats/custom accepts). Base fields (always available): clicks, hosts, earnings, income, noincome, payouts, conversions, cr, affiliate_epc, ratio, epc, trafficback, afprice. Tenant-gated: `ctr`/`views`/`ecpm` require the impressions feature flag; `costs`/`margin`/`roi` require the ad-costs flag (admin-only). A gated field on a tenant without the flag is rejected/dropped server-side. Note: `clicks_earnings`/`clicks_income` belong to the legacy LT/export endpoint and are NOT valid here.'),
    date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    date_to: z.string().optional().describe('End date (YYYY-MM-DD). Range must be ≤ 6 months.'),
    period: z.string().optional().describe('Quick period (today, yesterday, last7days, etc.)'),
    order: z.array(z.string()).optional()
      .describe('Fields to sort by. Prefix with "-" for DESC, e.g. ["-clicks", "country"] = clicks DESC then country ASC.'),
    orderType: z.enum(ORDER_TYPE_ENUM).optional()
      .describe('Sort direction (legacy; per-field "-" prefix in `order` is preferred)'),
    page: z.number().int().min(0).optional()
      .describe('Page number (Affise default 0; this server defaults to 1 for backward compat)'),
    limit: z.number().optional().describe('Results per page (default: 100, max: 500)'),
    timezone: z.string().optional().describe('IANA timezone (e.g. "Europe/Moscow", "UTC")'),
    locale: z.enum(LOCALE_ENUM).optional().describe('Response language'),
    conversionTypes: z.array(z.enum(CONVERSION_TYPE_ENUM)).optional()
      .describe('Conversion status types to include'),
    filter: z.object({
      partner: z.array(z.string()).optional(),
      supplier: z.array(z.string()).optional(),
      advertiser: z.array(z.string()).optional(),
      manager: z.array(z.string()).optional(),
      advertiser_manager_id: z.array(z.string()).optional(),
      affiliate_manager_id: z.array(z.string()).optional(),
      offer: z.array(z.number()).optional(),
      smart_id: z.array(z.string()).optional(),
      country: z.array(z.string()).optional(),
      city: z.array(z.string()).optional(),
      currency: z.array(z.string()).optional(),
      os: z.array(z.string()).optional(),
      device: z.array(z.string()).optional(),
      goal: z.array(z.string()).optional(),
      payment_status: z.array(z.string()).optional(),
      subaccount_id: z.array(z.string()).optional(),
      sub1: z.array(z.string()).optional(),
      sub2: z.array(z.string()).optional(),
      sub3: z.array(z.string()).optional(),
      sub4: z.array(z.string()).optional(),
      sub5: z.array(z.string()).optional(),
      sub6: z.array(z.string()).optional(),
      sub7: z.array(z.string()).optional(),
      sub8: z.array(z.string()).optional(),
      offer_tag: z.string().optional(),
      affiliate_tag: z.string().optional(),
      advertiser_tag: z.string().optional(),
      nonzero: z.union([z.literal(0), z.literal(1)]).optional(),
      balance_type: z.string().optional(),
      shave: z.union([z.literal(0), z.literal(1)]).optional(),
    }).optional()
      .describe('Filter conditions (Filter.php form). offer takes number[]. sub1..sub8 only; sub9..sub30 are NOT filterable.'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    // Probed 2026-05-22: partner key works with filter[date_from] form
    // (the serializer at src/tools/affise_custom_stats.ts:283-284 already
    // uses that). Partner gets data scoped to their affiliate id; the
    // admin_only_fields below are silently dropped server-side for them.
    'affise/role': ['admin', 'partner'],
    'affise/max_date_range_days': 180,
    'affise/sub_filter_cap': 8,
    'affise/admin_only_fields': ['costs', 'margin', 'roi'],
  },
} as const;

export const affise_stats_compare = {
  title: 'Affise Stats — Period-over-Period Compare',
  description:
    'Compare aggregate stats for a period against an auto-aligned prior period, via two /3.0/stats/custom pulls. Handles the month-to-date trap: `thismonth` is compared against the SAME day-range of last month (1–7 Jul vs 1–7 Jun), not a full month. Returns `current`/`baseline` totals + per-metric `delta` (abs + pct for counts/money; percentage-point `pp` for rates) + an alignment `note`. Alignment by period family: this/last month·quarter·year shift one unit back (day clamped); week shifts 7 days; rolling windows (last7days/last30days) use the equal window immediately before. Pass `period` (e.g. "thismonth", "lastweek") OR explicit `date_from`/`date_to` (baseline becomes the equal preceding window). `filter` mirrors affise_stats_raw (partner/offer/advertiser/country/os/sub1..8/…); names auto-resolve.',
  inputSchema: {
    period: z.string().optional()
      .describe('Named period for the current range: today, yesterday, thisweek, lastweek, last7days, last30days, thismonth, lastmonth, thisquarter, lastquarter, thisyear, lastyear, q1..q4. Default: thismonth. Ignored when date_from/date_to are set.'),
    date_from: z.string().optional().describe('Explicit current-range start (YYYY-MM-DD). With date_to, the baseline becomes the equal-length window immediately before.'),
    date_to: z.string().optional().describe('Explicit current-range end (YYYY-MM-DD).'),
    fields: z.array(z.enum(STATS_RAW_FIELDS_ENUM)).optional()
      .describe('Additive metrics to total and compare (default: clicks, conversions, income, trafficback). Rate fields like `cr` are recomputed from components, not summed.'),
    includeToday: z.boolean().optional()
      .describe('End the current period at today (default true) or at yesterday (false, last complete day).'),
    timezone: z.string().optional().describe('IANA timezone (e.g. "Europe/Moscow", "UTC")'),
    filter: z.object({
      partner: z.array(z.string()).optional(),
      affiliate: z.array(z.string()).optional(),
      supplier: z.array(z.string()).optional(),
      advertiser: z.array(z.string()).optional(),
      manager: z.array(z.string()).optional(),
      advertiser_manager_id: z.array(z.string()).optional(),
      affiliate_manager_id: z.array(z.string()).optional(),
      offer: z.array(z.number()).optional(),
      smart_id: z.array(z.string()).optional(),
      country: z.array(z.string()).optional(),
      city: z.array(z.string()).optional(),
      currency: z.array(z.string()).optional(),
      os: z.array(z.string()).optional(),
      device: z.array(z.string()).optional(),
      goal: z.array(z.string()).optional(),
      payment_status: z.array(z.string()).optional(),
      subaccount_id: z.array(z.string()).optional(),
      sub1: z.array(z.string()).optional(),
      sub2: z.array(z.string()).optional(),
      sub3: z.array(z.string()).optional(),
      sub4: z.array(z.string()).optional(),
      sub5: z.array(z.string()).optional(),
      sub6: z.array(z.string()).optional(),
      sub7: z.array(z.string()).optional(),
      sub8: z.array(z.string()).optional(),
      offer_tag: z.string().optional(),
      affiliate_tag: z.string().optional(),
      advertiser_tag: z.string().optional(),
    }).optional()
      .describe('Filter conditions (Filter.php form), mirroring affise_stats_raw. Omit for a network-wide (account-level) comparison.'),
  },
  _meta: {
    'affise/role': ['admin', 'partner'],
    'affise/max_date_range_days': 180,
  },
} as const;

export const affise_trafficback = {
  title: 'Affise Trafficback Stats',
  description: 'Traffic that Affise redirected away instead of counting toward an offer, broken down for the period (GET /3.0/stats/getbytrafficback). Returns the per-row breakdown plus an analysis_summary carrying the total, the leading rejection reasons and the affected countries. Filter by country, offer, advertiser, partner, device or os; the period defaults to last7days when none is given. Use it to explain a gap between the traffic a partner reports sending and the clicks Affise recorded, to locate mistargeted traffic, and before concluding that an offer underperforms. For one affiliate end to end, affise_affiliate_analysis already folds this in.',
  inputSchema: {
    date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    period: z.string().optional().describe('Quick period (today, yesterday, last7days, etc.)'),
    country: z.array(z.string()).optional().describe('Country codes to filter'),
    offer: z.array(z.number()).optional().describe('Offer IDs to filter'),
    advertiser: z.array(z.string()).optional().describe('Advertiser IDs to filter'),
    partner: z.array(z.string()).optional().describe('Partner IDs to filter'),
    device: z.array(z.string()).optional().describe('Device types to filter'),
    os: z.array(z.string()).optional().describe('Operating systems to filter'),
    page: z.number().optional().describe('Page number (default: 1)'),
    limit: z.number().optional().describe('Results per page (default: 100, max: 500)'),
    orderType: z.enum(ORDER_TYPE_ENUM).optional().describe('Sort direction (default: desc)'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_affiliate_analysis = {
  title: 'Affise Affiliate Analysis',
  description:
    'Composite account analysis for one affiliate: fans out stats-by-offer + trafficback + partner detail for the period, returns KPIs (confirmed conversions/earnings, active offers, trafficback total), a per-offer breakdown, a trafficback reason split, and rule-based insights (overcap, mistargeting, high decline rate, scale candidates). partner_id must be numeric — resolve logins via affise_list_partners first. Call this tool — instead of assembling the pulls manually — for "analyze partner/affiliate N", account-review requests, and when the user types "auto_analysis" / "auto-analysis" / "/auto_analysis" for a specific partner (that pseudo-command maps here).',
  inputSchema: {
    partner_id: z.number().int().min(1)
      .describe('Affiliate ID (required, numeric). Resolve names/logins via affise_list_partners first.'),
    date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
    period: z.string().optional()
      .describe('Quick period (today, yesterday, last7days, last30days, …). Default: last30days. Ignored when date_from/date_to are set.'),
    limit: z.number().int().min(1).max(500).optional()
      .describe('Max offers to pull into the breakdown (default 100, max 500)'),
  },
  outputSchema: {
    status: z.string().describe("'ok' on success, 'error' on a handled failure"),
    message: z.string().optional(),
    data: z.object({
      partner: z.unknown().optional(),
      period: z.unknown().optional(),
      kpis: z.record(z.string(), z.unknown()).optional(),
      offers: z.array(z.unknown()).optional(),
      trafficback: z.unknown().optional(),
      insights: z.array(z.unknown()).optional(),
    }).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string().optional(),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_retention_rate = {
  title: 'Affise Retention Rate',
  description: 'Retention rate / cohort analysis for a specific offer (GET /3.0/stats/retentionrate). For a given base_event (goal name), returns retention buckets across follow-up events. Admin only. All of date_from, date_to, offer_id, base_event, events are REQUIRED. Use this when /stats/custom cannot answer cohort-style retention questions. Event names must match goals configured on the offer.',
  inputSchema: {
    date_from: z.string().describe('Start date YYYY-MM-DD (required)'),
    date_to: z.string().describe('End date YYYY-MM-DD (required)'),
    offer_id: z.number().int().min(1).describe('Offer ID (required)'),
    base_event: z.string().regex(STARTS_WITH_LETTER_REGEX)
      .describe('Base goal name to anchor the cohort (required). Must start with a letter.'),
    events: z.array(z.string().regex(STARTS_WITH_LETTER_REGEX)).min(1)
      .describe('Follow-up event names to track (required, non-empty array). Each must start with a letter.'),
    timezone: z.string().optional().describe('IANA timezone (default Europe/Moscow)'),
    affiliate_id: z.number().int().min(1).optional().describe('Restrict to a single affiliate'),
    describe: z.boolean().optional().describe('Include human-readable description in response'),
    page: z.number().int().min(1).optional().describe('Page (default 1)'),
    limit: z.number().int().min(1).max(100).optional().describe('Per page (default 100, max 100)'),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_time_to_action = {
  title: 'Affise Time-to-Action',
  description: 'Time-to-action analysis — click → conversion latency distribution for a specific offer (GET /3.0/stats/time-to-action). Admin only. Returns rows already enriched with affiliate name/email. Requires CTIT feature enabled on the tenant; will return a clear "feature not enabled" error if disabled.',
  inputSchema: {
    date_from: z.string().describe('Start date YYYY-MM-DD (required)'),
    date_to: z.string().describe('End date YYYY-MM-DD (required)'),
    offer_id: z.number().int().min(1).describe('Offer ID (required)'),
    timezone: z.string().optional().describe('IANA timezone (default Europe/Moscow)'),
    affiliate_ids: z.string().optional().describe('Single ID or comma-separated affiliate IDs'),
    goal: z.string().optional().describe('Goal / event name filter'),
    page: z.number().int().min(1).optional().describe('Page'),
    limit: z.number().int().min(1).max(500).optional().describe('Per page (max 500)'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    'affise/role': 'admin',
    'affise/feature_flag': 'CTIT',
  },
} as const;

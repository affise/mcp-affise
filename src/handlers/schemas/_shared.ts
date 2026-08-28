/**
 * Shared Zod enums and helpers used across per-category schema files.
 * Keeping them in one module avoids drift between e.g. the stats_raw and
 * conversions_raw filter blocks that both reference sub1..sub8 / ORDER_TYPE.
 */

import { z } from 'zod';

// --- Sub-id vocabularies -----------------------------------------------------

export const SUB_KEYS_1_TO_30 = [
  'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8', 'sub9', 'sub10',
  'sub11', 'sub12', 'sub13', 'sub14', 'sub15', 'sub16', 'sub17', 'sub18', 'sub19', 'sub20',
  'sub21', 'sub22', 'sub23', 'sub24', 'sub25', 'sub26', 'sub27', 'sub28', 'sub29', 'sub30',
] as const;

// --- /stats/custom slice + fields vocabularies -------------------------------

export const STATS_RAW_SLICE_ENUM = [
  // Time
  'year', 'quarter', 'month', 'week', 'day', 'hour',
  // Entity
  'offer', 'goal',
  // Geo
  'country', 'city',
  // Tech
  'os', 'os_version', 'device', 'device_model', 'device_type', 'browser', 'browser_version',
  // Pages
  'landing', 'prelanding',
  // Network
  'isp', 'conn_type',
  // Managers
  'advertiser_manager_id', 'affiliate_manager_id',
  // Partner-side
  'affiliate', 'affiliate_id',
  // Other
  'smart_id', 'trafficback_reason',
  // Subs
  ...SUB_KEYS_1_TO_30,
  // Admin-only
  'advertiser', 'manager',
] as const;

// Mirrors Affise API CustomStat::getGoApiFields() — the exact set the
// /3.0/stats/custom endpoint validates against (Forms/Statistics/Clickhouse/Slice.php:
// "Request has invalid fields, available only: ...").
//   • Base fields (CustomStat::GOAPI_FIELDS) — always available.
//   • ctr/views/ecpm — gated by tenant config.allow_impressions.
//   • costs/margin/roi — gated by tenant config.enable_ad_costs (admin).
// Do NOT add clicks_earnings/clicks_income here: those are legacy LT-controller
// (StatisticsEntity::FIELD_CLICKS_*) fields, NOT accepted by /3.0/stats/custom —
// the endpoint would reject them with a 400 even though we'd let them through.
export const STATS_RAW_FIELDS_ENUM = [
  // Base — CustomStat::GOAPI_FIELDS
  'clicks', 'hosts', 'earnings', 'income', 'noincome', 'payouts',
  'conversions', 'cr', 'affiliate_epc', 'ratio', 'epc',
  'trafficback', 'afprice',
  // Gated by config.allow_impressions
  'ctr', 'views', 'ecpm',
  // Gated by config.enable_ad_costs (admin)
  'costs', 'margin', 'roi',
] as const;

// --- Conversion-related enums ------------------------------------------------

export const CONVERSION_TYPE_ENUM = ['total', 'confirmed', 'pending', 'declined', 'hold'] as const;

export const CONVERSIONS_STATUS_ENUM = ['confirmed', 'pending', 'declined', 'not_found', 'hold', 'total'] as const;

// --- General-purpose enums ---------------------------------------------------

export const ORDER_TYPE_ENUM = ['asc', 'desc'] as const;

export const LOCALE_ENUM = ['en', 'ru', 'es', 'pt', 'cn'] as const;

export const ADVERTISER_ORDER_ENUM = ['id', 'email', 'title', 'created_at', 'updated_at'] as const;

export const CATEGORIES_ORDER_ENUM = ['id', 'title'] as const;

export const PARTNER_SUB_KEY_ENUM = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;

// --- Regex constants ---------------------------------------------------------

export const MONGOID_REGEX = /^[a-fA-F0-9]{24}$/;
export const STARTS_WITH_LETTER_REGEX = /^[a-zA-Z].*/;

// --- Tool _meta namespace ----------------------------------------------------

/**
 * Machine-readable hints attached to each tool's `_meta` field.
 *
 * MCP spec 2025-06-18 allows arbitrary vendor metadata on tools via `_meta`.
 * We use the `affise/` namespace so the hints don't collide with anything
 * the SDK or the client itself might attach. Agents can pre-filter tool
 * picks against these without parsing free-form descriptions.
 *
 * Defined keys:
 *
 *   affise/role
 *     AffiseRoleHint | readonly AffiseRoleHint[]
 *     Which Affise API-key role(s) can call this tool. Single string for
 *     role-exclusive tools (e.g. all /3.0/admin/* are 'admin'), array for
 *     cross-role tools where /3.0/stats/custom accepts both admin and
 *     partner keys (the partner just gets data scoped to their affiliate
 *     id). 'any' = no Affise auth needed (affise_status only).
 *     Empirical access matrix that drove the array form was probed on
 *     2026-05-22 — see memory/project_tier3.4.2_role_taxonomy_rework.md.
 *
 *   affise/max_date_range_days
 *     number — upper bound on (date_to - date_from) the underlying endpoint
 *     accepts. Hardcoded server-side, not configurable.
 *
 *   affise/max_date_range_days_raw_export
 *     number — same, but in raw_export=1 mode. Stricter cap.
 *
 *   affise/admin_only_fields
 *     string[] — `fields[]` values silently dropped for non-admin roles.
 *     Calling these with a non-admin key won't error, but they won't appear
 *     in the response either.
 *
 *   affise/sub_filter_cap
 *     number — highest subN accepted as a filter[] key (slice / order
 *     accept more).
 *
 *   affise/feature_flag
 *     string — tenant feature flag the underlying endpoint requires. If
 *     the tenant doesn't have it, the tool returns a "feature not enabled"
 *     error.
 */
/** Affise user roles that a tool can declare in `affise/role`. */
export type AffiseRoleHint = 'admin' | 'partner' | 'advertiser' | 'any';

export type AffiseToolMeta = {
  'affise/role'?: AffiseRoleHint | readonly AffiseRoleHint[];
  'affise/max_date_range_days'?: number;
  'affise/max_date_range_days_raw_export'?: number;
  'affise/admin_only_fields'?: readonly string[];
  'affise/sub_filter_cap'?: number;
  'affise/feature_flag'?: string;
};

// --- Shared output schema ----------------------------------------------------

/**
 * Output schema applied to the six tabular tools (stats_raw, conversions_raw,
 * trafficback, list_partners, list_advertisers, find_subs). Every one of
 * them runs its `data` payload through `compactTabular()` first, so the
 * tabular shape `{columns, rows, dropped_columns?, total?, ...}` is what a
 * client should expect — but we keep the union open with `z.record` for the
 * "compactTabular found no rows-array to compact, original passes through"
 * fallback. `passthrough` allows the dispatch layer to add `cache_info` /
 * `performance` envelope fields without invalidating the schema.
 */
const TABULAR_DATA = z.union([
  z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.unknown())),
    dropped_columns: z.array(z.string()).optional(),
    total: z.number().optional(),
    page: z.number().optional(),
    per_page: z.number().optional(),
  }).passthrough(),
  z.record(z.string(), z.unknown()),
]);

export const TABULAR_OUTPUT_SCHEMA = {
  status: z.string().describe("'ok' on success, 'error' on a handled failure (still returned, not thrown)"),
  message: z.string().optional(),
  data: TABULAR_DATA.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
} as const;

/**
 * Output schema for the natural-language / smart offer-search tools.
 *
 * Declaring an output schema is what makes McpServer.registerTool populate
 * the response's `structuredContent` field alongside the JSON-stringified
 * `content[0].text`. Some MCP hosts (notably Claude.ai web) deliver the
 * structuredContent object — not the text payload — to widget iframes via
 * `ontoolresult`, so an offer-search tool without an outputSchema lands in
 * the widget as an empty result. Keeping the shape permissive (`offers` as
 * `unknown[]` rather than a full Offer schema) lets us evolve the underlying
 * tool response without churning the schema or the widget.
 */
export const OFFER_SEARCH_OUTPUT_SCHEMA = {
  status: z.string().describe("'ok' on success, 'error' on a handled failure"),
  message: z.string().optional(),
  offers: z.array(z.unknown()).optional().describe('Matched offers, one entry per offer.'),
  total_found: z.number().int().optional(),
  has_more_results: z.boolean().optional(),
  query_parsed: z.unknown().optional(),
  search_type: z.string().optional(),
  insights: z.unknown().optional(),
  recommendations: z.array(z.string()).optional(),
  timestamp: z.string().optional(),
} as const;

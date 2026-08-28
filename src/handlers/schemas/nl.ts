/**
 * Schemas for natural-language-driven tools and the status check.
 *
 * These tools share a "free-text query" or "no input" shape — they don't
 * fit into the structured /stats/custom or entity-CRUD groupings.
 */

import { z } from 'zod';
import { OFFER_SEARCH_OUTPUT_SCHEMA } from './_shared.js';

export const affise_status = {
  title: 'Affise Status',
  description: 'Check Affise API status',
  inputSchema: {} as Record<string, never>,
  _meta: {
    'affise/role': 'any',
  },
} as const;

export const affise_search_offers = {
  title: 'Search Affise Offers',
  description: 'Search offers with natural language (IMPROVED VERSION) - Supports complex queries like "Find gaming offers for US mobile traffic", "Show me dating offers", "Search for finance offers in UK"',
  inputSchema: {
    query: z.string().describe('Natural language search query with automatic category resolution and country detection'),
  },
  outputSchema: OFFER_SEARCH_OUTPUT_SCHEMA,
  _meta: {
    // Probed 2026-05-22: partner key returns 200 + offers list scoped to
    // the partner's connected affiliates. Same /3.0/offers endpoint as admin.
    'affise/role': ['admin', 'partner'],
  },
} as const;

export const affise_stats = {
  title: 'Affise Stats (Natural Language)',
  description: 'Get statistics with natural language. ENGLISH ONLY — translate non-English asks first, and write dates as ISO YYYY-MM-DD (named month phrases like "1-7 July" are NOT parsed). Supports: "by/breakdown by <dim> [and <dim>, ...]"; "dynamics/over time/trend" auto-adds `day` to slice; "top N <dim> by <metric>" sets limit + sort. Partner names like "aff_demo" are auto-resolved to numeric affiliate_id. A date or period is REQUIRED — there is no implicit default, and a query without one is rejected. Time periods: today/yesterday/last week/this month/last 30 days, a single day ("2026-07-28", "28.07.2026"), or an explicit "from YYYY-MM-DD to YYYY-MM-DD". MULTIPLE explicit ISO ranges in one ask ("from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14") run one pull per range → data.multi_period with a periods[] array (max 6 ranges). Period-over-period ("this month vs last", "WoW/MoM", "compared to the week before") auto-routes to affise_stats_compare (two range-aligned pulls → current/baseline totals + deltas). Cost / charge / spend → `income` field (admin-only `costs` is gated — use affise_stats_raw). For precise sub-ID/partner exports or filters this NL layer can miss, prefer affise_stats_raw with explicit slice/filter.',
  inputSchema: {
    query: z.string().describe('Natural language stats query'),
  },
  _meta: {
    // Probed 2026-05-22: partner key works with filter[date_from] form
    // (which our serializer already uses). Returns partner-scoped stats.
    'affise/role': ['admin', 'partner'],
    'affise/max_date_range_days': 180,
  },
} as const;

export const affise_smart_search = {
  title: 'Affise Smart Offer Search',
  description: 'Intelligent offer search with automatic category resolution and suggestions',
  inputSchema: {
    query: z.string().describe('Natural language search query (e.g., "Find gaming offers for mobile traffic")'),
    categories: z.array(z.string()).optional().describe('Category names or IDs to search in'),
    countries: z.array(z.string()).optional().describe('Country codes to filter'),
    auto_correct: z.boolean().optional().describe('Enable automatic category name correction (default: true)'),
  },
  outputSchema: OFFER_SEARCH_OUTPUT_SCHEMA,
  _meta: {
    // Probed 2026-05-22: partner-accessible; same /3.0/offers endpoint.
    'affise/role': ['admin', 'partner'],
  },
} as const;

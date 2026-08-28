/**
 * Schemas for partner (affiliate-role) tools — Phase A: read-only essentials.
 *
 * ALL six require a partner (affiliate) API key in env / session.
 * Admin keys will return 403 from the underlying Affise endpoint.
 *
 *  - affise_partner_profile      (/3.1/partner/me)
 *  - affise_partner_balance      (/3.0/balance)
 *  - affise_partner_offers       (/3.0/partner/offers)
 *  - affise_partner_live_offers  (/3.0/partner/live-offers)
 *  - affise_partner_find_subs    (/3.0/stats/find-subs)
 *  - affise_partner_news         (/3.0/news)
 */

import { z } from 'zod';
import { PARTNER_SUB_KEY_ENUM, TABULAR_OUTPUT_SCHEMA } from './_shared.js';

export const affise_partner_profile = {
  title: 'Affise Partner Profile',
  description: "Get the authenticated partner's own profile (GET /3.1/partner/me). Returns id, email, manager, permissions, balance summary, theme. REQUIRES a partner (affiliate) API key — admin keys return 403.",
  inputSchema: {} as Record<string, never>,
  _meta: {
    'affise/role': 'partner',
  },
} as const;

export const affise_partner_balance = {
  title: 'Affise Partner Balance',
  description: "Get the authenticated partner's multi-currency balance (GET /3.0/balance). Returns balance keyed by type (withdrawal, pending, ...) and currency (USD, EUR, ...). REQUIRES a partner API key.",
  inputSchema: {} as Record<string, never>,
  _meta: {
    'affise/role': 'partner',
  },
} as const;

const PARTNER_OFFERS_INPUT_SHAPE = {
  search: z.string().optional().describe('Search query (server param `q`)'),
  countries: z.array(z.string()).optional().describe('ISO country codes'),
  categories: z.array(z.string()).optional().describe('Category IDs'),
  int_id: z.array(z.number().int()).optional().describe('Specific offer IDs'),
  privacy: z.array(z.string()).optional().describe('Privacy filters'),
  updated_at: z.string().optional().describe('Filter by update date YYYY-MM-DD'),
  from: z.string().optional().describe('Start date YYYY-MM-DD'),
  to: z.string().optional().describe('End date YYYY-MM-DD'),
  caps_type: z.string().optional().describe('Caps filter type'),
  caps_country: z.string().optional().describe('Caps filter country'),
  sort: z.string().optional().describe('Sort field'),
  page: z.number().int().min(1).optional().describe('Page (default 1)'),
  limit: z.number().int().min(1).max(500).optional().describe('Per page (default 100, max 500)'),
} as const;

export const affise_partner_offers = {
  title: 'Affise Partner Offers',
  description: "List offers AVAILABLE to the authenticated partner (GET /3.0/partner/offers) — offers the partner can request access to. The catalog can be very large (100K+ on big tenants); narrow with `search`, `countries`, `categories`, or `int_id` before raising `limit`. Default 100, max 500. Use affise_partner_live_offers for currently-running offers. REQUIRES a partner (affiliate) API key.",
  inputSchema: PARTNER_OFFERS_INPUT_SHAPE,
  _meta: {
    'affise/role': 'partner',
  },
} as const;

export const affise_partner_live_offers = {
  title: 'Affise Partner Live Offers',
  description: 'List offers the authenticated partner is CURRENTLY RUNNING (GET /3.0/partner/live-offers). Same filter shape as affise_partner_offers but scoped to active connections — usually a small portfolio. REQUIRES a partner (affiliate) API key.',
  inputSchema: PARTNER_OFFERS_INPUT_SHAPE,
  _meta: {
    'affise/role': 'partner',
  },
} as const;

export const affise_partner_find_subs = {
  title: 'Find Affise Partner Subs',
  description: "Discover distinct sub values in the partner's own data (GET /3.0/stats/find-subs). Pick ONE sub key (sub1..sub5) — backend ignores all but the first. Use for exploratory analytics: \"what sub3 values do I have\" → then drill via affise_stats_raw. REQUIRES a partner (affiliate) API key.",
  inputSchema: {
    sub_key: z.enum(PARTNER_SUB_KEY_ENUM).describe('Which sub field to enumerate (required, one of sub1..sub5)'),
    sub_value: z.string().optional().describe('Optional partial-value filter; empty returns top-N distinct values'),
    page: z.number().int().min(1).optional().describe('Page (default 1)'),
    limit: z.number().int().min(1).max(500).optional().describe('Per page (default 100, max 500)'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    'affise/role': 'partner',
  },
} as const;

export const affise_partner_news = {
  title: 'Affise Partner News',
  description: 'List platform announcements visible to the partner (GET /3.0/news). Uses skip/limit pagination (NOT page). Pass fixed=true for pinned items only. A 404 from the API is normalised to an empty list. Embedded base64 images in news bodies are replaced with `[IMAGE]` markers BY DEFAULT — pass `strip_images=false` to keep raw image bytes. REQUIRES a partner (affiliate) API key.',
  inputSchema: {
    limit: z.number().int().min(1).optional().describe('Items per page (server default applied if omitted)'),
    skip: z.number().int().min(0).optional().describe('Offset (default 0)'),
    fixed: z.boolean().optional().describe('When true, only return pinned items'),
    strip_images: z.boolean().optional().describe('Replace base64 images with `[IMAGE]` markers. DEFAULT TRUE. Pass false only if you actually need raw image bytes.'),
  },
  _meta: {
    'affise/role': 'partner',
  },
} as const;

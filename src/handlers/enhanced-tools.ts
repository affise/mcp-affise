/**
 * Enhanced Tool Handler - Improved version of simple-tools.ts
 * Gradual enhancement with caching, error handling, and validation
 */

import { createHash } from 'crypto';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Enhanced services
import { CacheService } from '../services/cache-service.js';
import { ErrorHandlerService } from '../services/error-handler-service.js';
import { ValidationService, STATS_RAW_SLICES, STATS_RAW_FIELDS } from '../services/validation-service.js';

// Import API functions - UPDATED TO USE UNIFIED SYSTEM
import { createAffiseStatusTool } from '../tools/affise_status.js';
import { unifiedSearchOffers, searchWithNaturalLanguage } from '../tools/unified_affise_offers.js';
import { getAffiseCustomStats } from '../tools/affise_custom_stats.js';
import { getOfferCategories, searchCategoriesByTitle } from '../tools/affise_offer_categories.js';
import { getTrafficbackStats } from '../tools/affise_trafficback.js';
import { getAffiseConversions } from '../tools/affise_conversions.js';
import { getOfferTrackingLink } from '../tools/affise_offer_tracking_link.js';
import { getOfferDetail } from '../tools/affise_offer_detail.js';
import { listPartners, getPartner } from '../tools/affise_partners.js';
import { listAdvertisers, getAdvertiser } from '../tools/affise_advertisers.js';
import { getRetentionRate } from '../tools/affise_retention.js';
import { getTimeToAction } from '../tools/affise_time_to_action.js';
import { getConversionById } from '../tools/affise_conversion_by_id.js';
import { getPartnerProfile } from '../tools/affise_partner_profile.js';
import { getPartnerBalance } from '../tools/affise_partner_balance.js';
import { listPartnerOffers, listPartnerLiveOffers } from '../tools/affise_partner_offers.js';
import { findPartnerSubs } from '../tools/affise_partner_find_subs.js';
import { listPartnerNews } from '../tools/affise_partner_news.js';

// Import existing parsers (keep current functionality)
import { parseQuery, toStatsParams, findDateLikeToken, extractExplicitDateRanges } from '../types/simple-parser.js';
import { OfferSearchResponse, StatsResponse } from '../types/api-responses.js';
import { getDateRange } from '../shared/date-utils.js';

// Deterministic serializer for cache keys. JSON.stringify's second argument is
// a property ALLOWLIST applied at every nesting level (not a sort), which made
// nested `filter.*` keys vanish from the key — two queries differing only by
// partner / sub / goal / country shared one cache entry within the TTL.
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

// Tool definitions (same as before)
export const TOOLS = [
  {
    name: 'affise_status',
    description: 'Check Affise API status',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'affise_search_offers',
    description: 'Search offers with natural language (IMPROVED VERSION) - Supports complex queries like "Find gaming offers for US mobile traffic", "Show me dating offers", "Search for finance offers in UK"',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query with automatic category resolution and country detection'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_stats',
    description: 'Get statistics with natural language (e.g., "Show me revenue by country last month", "top 10 offers by income last week", "cost dynamics by affiliate and sub1"). ENGLISH ONLY — translate non-English asks first, and write dates as ISO YYYY-MM-DD (named month phrases like "1-7 July" are NOT parsed). Supports: by/breakdown by <dim> [and <dim>, ...]; "dynamics"/"over time"/"trend" auto-adds `day` to slice; "top N <dim> by <metric>" sets limit + sort. Partner names like "aff_demo" are auto-resolved to numeric affiliate_id via /3.0/admin/partners — no need to look up first. A date or period is REQUIRED — there is no implicit default, and a query without one is rejected. Time periods: today/yesterday/last week/this month/last 30 days, a single day ("2026-07-28", "28.07.2026"), or an explicit "from YYYY-MM-DD to YYYY-MM-DD". MULTIPLE explicit ISO ranges in one ask ("from 2026-07-01 to 2026-07-07 and from 2026-07-08 to 2026-07-14") run one pull per range → data.multi_period with a periods[] array (max 6 ranges). Cost / charge / spend → `income` field (admin-only `costs` is gated — use affise_stats_raw for that). Max date range 6 months.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language stats query'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_stats_raw',
    description: 'Raw stats via Affise /3.0/stats/custom. CRITICAL rules:\n' +
      '1. Filter ID types differ. The MCP server auto-resolves names → IDs for you:\n' +
      '   - `filter.partner` / `affiliate` — NUMERIC affiliate_id (e.g. 394). Pass a clientId like "aff_demo" and we resolve via /3.0/admin/partners.\n' +
      '   - `filter.offer` — NUMERIC offer_id (e.g. 12345). Resolve names via affise_search_offers.\n' +
      '   - `filter.advertiser` / `supplier` — 24-char hex MongoID (e.g. "507f1f77bcf86cd799439011"). Pass a name like "Acme Corp" and we resolve via /3.0/admin/advertisers.\n' +
      '2. `order[]` vocabulary DIFFERS from `fields[]` — sort keys are: total_revenue, total_count, total_null, raw, uniq, confirmed_earning, confirmed_count, confirmed_revenue, pending_count, pending_revenue, declined_count, declined_revenue, hold_count, hold_revenue (+admin: advertiser, affiliate, manager). NOT field names like "income" or "clicks".\n' +
      '3. Sort direction via `orderType` ("asc"|"desc"). DO NOT prefix order values with "-".\n' +
      '4. Date range ≤ 6 months. Date format YYYY-MM-DD.\n' +
      '5. Sub cap: filter accepts sub1..sub8 only; slice/order accept sub1..sub30.\n' +
      'Admin-only fields (`costs`/`margin`/`roi`) silently dropped for non-admin. `costs` is also incompatible with os/sub*/geo slices server-side. Full reference: docs/affise-stats-custom-reference.md.',
    inputSchema: {
      type: 'object',
      properties: {
        slice: {
          type: 'array',
          items: {
            type: 'string',
            // Single source of truth — see STATS_RAW_SLICES in validation-service.
            enum: [...STATS_RAW_SLICES]
          },
          description: 'Grouping dimensions per Affise API StatisticsEntity::getAllowedSliced(). `advertiser` and `manager` are admin-only. Sub IDs sub1..sub30 valid as slice (filter is capped at sub1..sub8). Note: `trafficback_reason` is ONLY compatible with `fields: ["trafficback"]` — conversion/traffic metrics are disabled server-side when this slice is present. Combine with other slices like `country`/`offer` to get drill-down (slice=["trafficback_reason","country"], fields=["trafficback"]).'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
            // Single source of truth — see STATS_RAW_FIELDS in validation-service.
            // Matches Affise CustomStat::getGoApiFields() (what /3.0/stats/custom accepts).
            enum: [...STATS_RAW_FIELDS]
          },
          description: 'Metrics to include, matching Affise CustomStat::getGoApiFields() (what /3.0/stats/custom accepts). Base fields (always available): clicks, hosts, earnings, income, noincome, payouts, conversions, cr, affiliate_epc, ratio, epc, trafficback, afprice. Tenant-gated: `ctr`/`views`/`ecpm` require the impressions feature flag; `costs`/`margin`/`roi` require the ad-costs flag (admin-only). A gated field on a tenant without the flag is rejected/dropped server-side. Note: `clicks_earnings`/`clicks_income` belong to the legacy export endpoint and are NOT valid here.'
        },
        date_from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        date_to: {
          type: 'string',
          description: 'End date (YYYY-MM-DD). Range must be ≤ 6 months.'
        },
        period: {
          type: 'string',
          description: 'Quick period (today, yesterday, last7days, etc.)'
        },
        order: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to sort by. Prefix with "-" for DESC, e.g. ["-clicks", "country"] = clicks DESC then country ASC.'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (legacy; per-field "-" prefix in `order` is preferred)'
        },
        page: {
          type: 'integer',
          minimum: 0,
          description: 'Page number (Affise default 0; this server defaults to 1 for backward compat)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 500)'
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (e.g. "Europe/Moscow", "UTC")'
        },
        locale: {
          type: 'string',
          enum: ['en', 'ru', 'es', 'pt', 'cn'],
          description: 'Response language'
        },
        conversionTypes: {
          type: 'array',
          items: { type: 'string', enum: ['total', 'confirmed', 'pending', 'declined', 'hold'] },
          description: 'Conversion status types to include'
        },
        filter: {
          type: 'object',
          description: 'Filter conditions (Filter.php form). offer takes number[]. sub1..sub8 only; sub9..sub30 are NOT filterable.',
          properties: {
            // Sides — use `partner` (NOT `affiliate`) per Filter.php
            partner: { type: 'array', items: { type: 'string' } },
            supplier: { type: 'array', items: { type: 'string' } },
            advertiser: { type: 'array', items: { type: 'string' } },
            // Managers
            manager: { type: 'array', items: { type: 'string' } },
            advertiser_manager_id: { type: 'array', items: { type: 'string' } },
            affiliate_manager_id: { type: 'array', items: { type: 'string' } },
            // Entity
            offer: { type: 'array', items: { type: 'number' } },
            smart_id: { type: 'array', items: { type: 'string' } },
            // Geo
            country: { type: 'array', items: { type: 'string' } },
            city: { type: 'array', items: { type: 'string' } },
            currency: { type: 'array', items: { type: 'string' } },
            // Tech (only ones in Filter.php)
            os: { type: 'array', items: { type: 'string' } },
            device: { type: 'array', items: { type: 'string' } },
            // Other
            goal: { type: 'array', items: { type: 'string' } },
            payment_status: { type: 'array', items: { type: 'string' } },
            subaccount_id: { type: 'array', items: { type: 'string' } },
            // sub1..sub8 ONLY
            sub1: { type: 'array', items: { type: 'string' } },
            sub2: { type: 'array', items: { type: 'string' } },
            sub3: { type: 'array', items: { type: 'string' } },
            sub4: { type: 'array', items: { type: 'string' } },
            sub5: { type: 'array', items: { type: 'string' } },
            sub6: { type: 'array', items: { type: 'string' } },
            sub7: { type: 'array', items: { type: 'string' } },
            sub8: { type: 'array', items: { type: 'string' } },
            // Single-value
            offer_tag: { type: 'string' },
            affiliate_tag: { type: 'string' },
            advertiser_tag: { type: 'string' },
            nonzero: { type: 'integer', enum: [0, 1] },
            balance_type: { type: 'string' },
            shave: { type: 'integer', enum: [0, 1] }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_offer_categories',
    description: 'Get all available offer categories from Affise',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific category IDs to retrieve'
        },
        search: {
          type: 'string',
          description: 'Search term to filter categories by title'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 99999)'
        },
        order: {
          type: 'string',
          enum: ['id', 'title'],
          description: 'Sort field (default: id)'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: asc)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_trafficback',
    description: 'Get trafficback statistics and analysis',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        date_to: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)'
        },
        period: {
          type: 'string',
          description: 'Quick period (today, yesterday, last7days, etc.)'
        },
        country: {
          type: 'array',
          items: { type: 'string' },
          description: 'Country codes to filter'
        },
        offer: {
          type: 'array',
          items: { type: 'number' },
          description: 'Offer IDs to filter'
        },
        advertiser: {
          type: 'array',
          items: { type: 'string' },
          description: 'Advertiser IDs to filter'
        },
        partner: {
          type: 'array',
          items: { type: 'string' },
          description: 'Partner IDs to filter'
        },
        device: {
          type: 'array',
          items: { type: 'string' },
          description: 'Device types to filter'
        },
        os: {
          type: 'array',
          items: { type: 'string' },
          description: 'Operating systems to filter'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 500)'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: desc)'
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: 'affise_smart_search',
    description: 'Intelligent offer search with automatic category resolution and suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g., "Find gaming offers for mobile traffic")'
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category names or IDs to search in'
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Country codes to filter'
        },
        auto_correct: {
          type: 'boolean',
          description: 'Enable automatic category name correction (default: true)'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_conversions_raw',
    description: 'Get raw conversion records from Affise /3.0/stats/conversions. Returns individual conversion rows (one per event) with raw fields: ip, country, ua, os, device, click_time, status, sub1..sub8, custom_field_1..15, etc. Max limit 1000. Date range ≤ 365 days (≤ 63 days in raw_export mode). Use this when you need per-conversion detail; use affise_stats_raw for aggregated metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD (required)' },
        date_to:   { type: 'string', description: 'End date YYYY-MM-DD (required, ≤ date_from + 365 days)' },
        time_from: { type: 'string', description: 'Optional time bound HH:MM:SS' },
        time_to:   { type: 'string', description: 'Optional time bound HH:MM:SS' },
        status: {
          type: 'array',
          items: { type: 'string', enum: ['confirmed', 'pending', 'declined', 'not_found', 'hold', 'total'] },
          description: 'Conversion statuses to include. "total" = no filter.'
        },
        filter: {
          type: 'object',
          description: 'Filter conditions. Sub IDs capped at sub1..sub8 by Conversion.php form.',
          properties: {
            partner:    { type: 'array', items: { type: 'string' }, description: 'Affiliate / partner IDs (canonical filter key — NOT `affiliate`)' },
            offer:      { type: 'array', items: { type: 'number' } },
            advertiser: { type: 'array', items: { type: 'string' } },
            supplier:   { type: 'array', items: { type: 'string' } },
            country:    { type: 'array', items: { type: 'string' } },
            city:       { type: 'array', items: { type: 'string' } },
            os:         { type: 'array', items: { type: 'string' } },
            device:     { type: 'array', items: { type: 'string' } },
            device_type:{ type: 'array', items: { type: 'string' } },
            browser:    { type: 'array', items: { type: 'string' } },
            goal:       { type: 'array', items: { type: 'string' } },
            fraud_type: { type: 'array', items: { type: 'string' } },
            sub1: { type: 'array', items: { type: 'string' } },
            sub2: { type: 'array', items: { type: 'string' } },
            sub3: { type: 'array', items: { type: 'string' } },
            sub4: { type: 'array', items: { type: 'string' } },
            sub5: { type: 'array', items: { type: 'string' } },
            sub6: { type: 'array', items: { type: 'string' } },
            sub7: { type: 'array', items: { type: 'string' } },
            sub8: { type: 'array', items: { type: 'string' } },
            // Scalar identifier filters
            action_id:        { type: 'string' },
            clickid:          { type: 'string' },
            promocode:        { type: 'string' },
            imp_id:           { type: 'string' },
            invoice_id:       { type: 'string' },
            user_id:          { type: 'string' },
            offer_tag:        { type: 'string' },
            affiliate_tag:    { type: 'string' },
            advertiser_tag:   { type: 'string' },
            payment_status:   { type: 'string' },
            fraud_risk_level: { type: 'string' },
            decline_reason:   { type: 'string' },
            smart_id:         { type: 'string', description: 'numeric ID, or "all_smartlinks" / "direct_traffic"' },
            payouts_from: { type: 'number' },
            payouts_to:   { type: 'number' },
            shave:        { type: 'integer', enum: [0, 1] }
          },
          additionalProperties: false
        },
        page:  { type: 'integer', minimum: 1, description: 'Page (default 1)' },
        limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'Results per page (default 100, max 1000)' },
        order: { type: 'string', description: 'Single sort field (no array)' },
        sort:  { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default desc)' },
        timezone: { type: 'string', description: 'IANA timezone' },
        currency: { type: 'integer', description: 'Currency ID' },
        fields:   { type: 'string', description: 'Comma-separated column selector — narrow the response payload' },
        raw_export: {
          type: 'integer',
          enum: [0, 1],
          description: 'When 1, bypass the response mapper and return unmapped ClickHouse rows. Caps date range at 63 days.'
        }
      },
      required: ['date_from', 'date_to'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_get_offer',
    description: 'Get full detail for a single offer by ID (GET /3.0/offer/{id}). Use after affise_search_offers or when an offer_id is known from a conversion row. Returns the offer object with id, title, status, payouts, targeting, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id: { type: 'integer', minimum: 1, description: 'Offer ID' }
      },
      required: ['offer_id'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_list_partners',
    description: 'List affiliates (partners) with pagination and filters (GET /3.0/admin/partners). Admin only. Useful for "show me partners from country X with status active" or to enumerate the affiliate roster.',
    inputSchema: {
      type: 'object',
      properties: {
        search:       { type: 'string', description: 'Search by name / email' },
        id:           { type: 'array', items: { type: 'integer' }, description: 'Filter by specific affiliate IDs' },
        manager:      { type: 'array', items: { type: 'string' }, description: 'Filter by manager user IDs' },
        status:       { type: 'string', description: 'Affiliate status (e.g. "active")' },
        updated_at:   { type: 'string', description: 'Filter by update date (YYYY-MM-DD)' },
        with_balance: { type: 'boolean', description: 'Include balance field' },
        page:         { type: 'integer', minimum: 1, description: 'Page number (default 1)' },
        limit:        { type: 'integer', minimum: 1, maximum: 500, description: 'Results per page (default 100, max 500)' },
        order:        { type: 'string', description: 'Sort field' },
        orderType:    { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_get_partner',
    description: 'Get full detail for a single affiliate by ID (GET /3.0/admin/partner/{id}). Admin only. Use to drill down from stats slice="partner" or affise_list_partners.',
    inputSchema: {
      type: 'object',
      properties: {
        partner_id: { type: 'integer', minimum: 1, description: 'Affiliate (partner) ID' }
      },
      required: ['partner_id'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_list_advertisers',
    description: 'List advertisers with pagination and filters (GET /3.0/admin/advertisers). Useful for enumerating advertisers or finding one by name. Pass with_offers=true to include offers_count per advertiser.',
    inputSchema: {
      type: 'object',
      properties: {
        id:          { type: 'string', description: 'Filter by advertiser ID (MongoId hex)' },
        name:        { type: 'string', description: 'Filter by advertiser title' },
        tags:        { type: 'string', description: 'Filter by tags' },
        updated_at:  { type: 'string', description: 'Filter by update date (YYYY-MM-DD)' },
        with_offers: { type: 'boolean', description: 'Include offers_count per advertiser' },
        page:        { type: 'integer', minimum: 1, description: 'Page number (default 1)' },
        limit:       { type: 'integer', minimum: 1, maximum: 500, description: 'Results per page (default 100, max 500)' },
        order:       { type: 'string', enum: ['id', 'email', 'title', 'created_at', 'updated_at'], description: 'Sort field' },
        orderType:   { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default asc)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_get_advertiser',
    description: 'Get full detail for a single advertiser by ID (GET /3.0/admin/advertiser/{id}). Advertiser ID is a 24-char MongoId hex string (e.g. "507f1f77bcf86cd799439011"), NOT an integer.',
    inputSchema: {
      type: 'object',
      properties: {
        advertiser_id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: '24-char hex MongoId of the advertiser' }
      },
      required: ['advertiser_id'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_retention_rate',
    description: 'Retention rate / cohort analysis for a specific offer (GET /3.0/stats/retentionrate). For a given base_event (goal name), returns retention buckets across follow-up events. Admin only. All of date_from, date_to, offer_id, base_event, events are REQUIRED. Use this when /stats/custom cannot answer cohort-style retention questions. Event names must match goals configured on the offer.',
    inputSchema: {
      type: 'object',
      properties: {
        date_from:    { type: 'string', description: 'Start date YYYY-MM-DD (required)' },
        date_to:      { type: 'string', description: 'End date YYYY-MM-DD (required)' },
        offer_id:     { type: 'integer', minimum: 1, description: 'Offer ID (required)' },
        base_event:   { type: 'string', pattern: '^[a-zA-Z].*', description: 'Base goal name to anchor the cohort (required). Must start with a letter.' },
        events:       {
          type: 'array',
          items: { type: 'string', pattern: '^[a-zA-Z].*' },
          minItems: 1,
          description: 'Follow-up event names to track (required, non-empty array). Each must start with a letter.'
        },
        timezone:     { type: 'string', description: 'IANA timezone (default Europe/Moscow)' },
        affiliate_id: { type: 'integer', minimum: 1, description: 'Restrict to a single affiliate' },
        describe:     { type: 'boolean', description: 'Include human-readable description in response' },
        page:         { type: 'integer', minimum: 1, description: 'Page (default 1)' },
        limit:        { type: 'integer', minimum: 1, maximum: 100, description: 'Per page (default 100, max 100)' }
      },
      required: ['date_from', 'date_to', 'offer_id', 'base_event', 'events'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_time_to_action',
    description: 'Time-to-action analysis — click → conversion latency distribution for a specific offer (GET /3.0/stats/time-to-action). Admin only. Returns rows already enriched with affiliate name/email. Requires CTIT feature enabled on the tenant; will return a clear "feature not enabled" error if disabled.',
    inputSchema: {
      type: 'object',
      properties: {
        date_from:      { type: 'string', description: 'Start date YYYY-MM-DD (required)' },
        date_to:        { type: 'string', description: 'End date YYYY-MM-DD (required)' },
        offer_id:       { type: 'integer', minimum: 1, description: 'Offer ID (required)' },
        timezone:       { type: 'string', description: 'IANA timezone (default Europe/Moscow)' },
        affiliate_ids:  { type: 'string', description: 'Single ID or comma-separated affiliate IDs' },
        goal:           { type: 'string', description: 'Goal / event name filter' },
        page:           { type: 'integer', minimum: 1, description: 'Page' },
        limit:          { type: 'integer', minimum: 1, maximum: 500, description: 'Per page (max 500)' }
      },
      required: ['date_from', 'date_to', 'offer_id'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_get_conversion',
    description: 'Get full detail for a single conversion by its MongoId (GET /3.0/stats/conversionsbyid). Admin only. Use as drill-down from affise_conversions_raw — when a row has interesting fields and you need the complete record (offer object, all custom_field_1..15, price, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        id:       { type: 'string', pattern: '^[a-fA-F0-9]{24}$', description: '24-char hex MongoId of the conversion (from affise_conversions_raw row id)' },
        timezone: { type: 'string', description: 'IANA timezone override' }
      },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_offer_tracking_link',
    description: 'Generate a tracking link for a specific offer + affiliate (POST /3.0/admin/offer/{offerId}/tracking-link). Admin/manager only. Validates that the affiliate is allowed to run the offer based on its privacy settings. Optional sub1..sub8 are appended to the resulting URL as query params.',
    inputSchema: {
      type: 'object',
      properties: {
        offer_id:     { type: 'integer', minimum: 1, description: 'Offer ID (path parameter)' },
        affiliate_id: { type: 'integer', minimum: 1, description: 'Affiliate ID to generate the link for' },
        sub1: { type: 'string', description: 'Sub parameter 1' },
        sub2: { type: 'string', description: 'Sub parameter 2' },
        sub3: { type: 'string', description: 'Sub parameter 3' },
        sub4: { type: 'string', description: 'Sub parameter 4' },
        sub5: { type: 'string', description: 'Sub parameter 5' },
        sub6: { type: 'string', description: 'Sub parameter 6' },
        sub7: { type: 'string', description: 'Sub parameter 7' },
        sub8: { type: 'string', description: 'Sub parameter 8' }
      },
      required: ['offer_id', 'affiliate_id'],
      additionalProperties: false
    }
  },
  // === Partner (affiliate) tools — Phase A: read-only essentials ===
  // ALL six require a partner (affiliate) API key in env / session.
  // Admin keys will return 403 from the underlying Affise endpoint.
  {
    name: 'affise_partner_profile',
    description: 'Get the authenticated partner\'s own profile (GET /3.1/partner/me). Returns id, email, manager, permissions, balance summary, theme. REQUIRES a partner (affiliate) API key — admin keys return 403.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'affise_partner_balance',
    description: 'Get the authenticated partner\'s multi-currency balance (GET /3.0/balance). Returns balance keyed by type (withdrawal, pending, ...) and currency (USD, EUR, ...). REQUIRES a partner API key.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'affise_partner_offers',
    description: 'List offers AVAILABLE to the authenticated partner (GET /3.0/partner/offers) — i.e. offers the partner can request access to. REQUIRES a partner API key. Use affise_partner_live_offers for the partner\'s currently-running offers. NOTE: the available catalog can be very large (100K+ on big tenants); always narrow with `search`, `countries`, `categories`, or `int_id` filters before increasing `limit`. Default limit is 100, max 500.',
    inputSchema: {
      type: 'object',
      properties: {
        search:     { type: 'string', description: 'Search query (server param `q`)' },
        countries:  { type: 'array', items: { type: 'string' }, description: 'ISO country codes' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
        int_id:     { type: 'array', items: { type: 'integer' }, description: 'Specific offer IDs' },
        privacy:    { type: 'array', items: { type: 'string' }, description: 'Privacy filters' },
        updated_at: { type: 'string', description: 'Filter by update date YYYY-MM-DD' },
        from:       { type: 'string', description: 'Start date YYYY-MM-DD' },
        to:         { type: 'string', description: 'End date YYYY-MM-DD' },
        caps_type:    { type: 'string', description: 'Caps filter type' },
        caps_country: { type: 'string', description: 'Caps filter country' },
        sort:       { type: 'string', description: 'Sort field' },
        page:       { type: 'integer', minimum: 1, description: 'Page (default 1)' },
        limit:      { type: 'integer', minimum: 1, maximum: 500, description: 'Per page (default 100, max 500)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_partner_live_offers',
    description: 'List offers the authenticated partner is CURRENTLY RUNNING (GET /3.0/partner/live-offers). Same filter shape as affise_partner_offers but scoped to active connections — usually a small portfolio, but use `search` / `countries` / `categories` filters if the partner has many active offers. REQUIRES a partner API key.',
    inputSchema: {
      type: 'object',
      properties: {
        search:     { type: 'string', description: 'Search query (server param `q`)' },
        countries:  { type: 'array', items: { type: 'string' }, description: 'ISO country codes' },
        categories: { type: 'array', items: { type: 'string' }, description: 'Category IDs' },
        int_id:     { type: 'array', items: { type: 'integer' }, description: 'Specific offer IDs' },
        privacy:    { type: 'array', items: { type: 'string' }, description: 'Privacy filters' },
        updated_at: { type: 'string', description: 'Filter by update date YYYY-MM-DD' },
        from:       { type: 'string', description: 'Start date YYYY-MM-DD' },
        to:         { type: 'string', description: 'End date YYYY-MM-DD' },
        caps_type:    { type: 'string', description: 'Caps filter type' },
        caps_country: { type: 'string', description: 'Caps filter country' },
        sort:       { type: 'string', description: 'Sort field' },
        page:       { type: 'integer', minimum: 1, description: 'Page (default 1)' },
        limit:      { type: 'integer', minimum: 1, maximum: 500, description: 'Per page (default 100, max 500)' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_partner_find_subs',
    description: 'Discover distinct sub values in the partner\'s own data (GET /3.0/stats/find-subs). Pick ONE sub key (sub1..sub5) to query — backend ignores all but the first. Use this for exploratory analytics: "what sub3 values do I have" → then drill via affise_stats_raw with the discovered values. REQUIRES a partner API key.',
    inputSchema: {
      type: 'object',
      properties: {
        sub_key:   { type: 'string', enum: ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'], description: 'Which sub field to enumerate (required, one of sub1..sub5)' },
        sub_value: { type: 'string', description: 'Optional partial-value filter; empty returns top-N distinct values' },
        page:      { type: 'integer', minimum: 1, description: 'Page (default 1)' },
        limit:     { type: 'integer', minimum: 1, maximum: 500, description: 'Per page (default 100, max 500)' }
      },
      required: ['sub_key'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_partner_news',
    description: 'List platform announcements visible to the partner (GET /3.0/news). Uses skip/limit pagination (NOT page). Pass fixed=true for pinned items only. REQUIRES a partner API key. A 404 from the API is normalised to an empty list. Embedded base64 images in news bodies are replaced with `[IMAGE]` markers BY DEFAULT (saves multi-MB of token-window bloat) — pass `strip_images=false` to keep raw image bytes.',
    inputSchema: {
      type: 'object',
      properties: {
        limit:        { type: 'integer', minimum: 1, description: 'Items per page (server default applied if omitted)' },
        skip:         { type: 'integer', minimum: 0, description: 'Offset (default 0)' },
        fixed:        { type: 'boolean', description: 'When true, only return pinned items' },
        strip_images: { type: 'boolean', description: 'Replace base64 images with `[IMAGE]` markers. DEFAULT TRUE. Pass false only if you actually need raw image bytes.' }
      },
      additionalProperties: false
    }
  }
];

// All 23 Affise tools are read-only against the API. `openWorldHint` signals
// that results depend on external state (the Affise backend), so the host
// should not cache or treat outputs as deterministic.
for (const tool of TOOLS as Array<{ annotations?: Record<string, unknown> }>) {
  tool.annotations = { readOnlyHint: true, openWorldHint: true };
}

/**
 * Enhanced tool handler class
 */
export class EnhancedToolHandler {
  private cacheService: CacheService;
  private errorHandler: ErrorHandlerService;
  private validator: ValidationService;

  constructor(private config: { baseUrl: string; apiKey: string } | null) {
    // Initialize services
    this.cacheService = new CacheService({
      defaultTTL: 300000, // 5 minutes
      maxSize: 1000,
      cleanupInterval: 600000 // 10 minutes
    });
    
    this.errorHandler = new ErrorHandlerService();
    this.validator = new ValidationService();
  }

  /**
   * Execute tool with enhanced features
   */
  async executeTool(
    toolName: string,
    args: any,
    userSession?: { baseUrl: string; apiKey: string }
  ): Promise<any> {
    const startTime = Date.now();

    try {
      // Validate tool exists
      if (!TOOLS.find(t => t.name === toolName)) {
        return this.errorHandler.createErrorResponse(
          `Unknown tool: ${toolName}`,
          'TOOL_NOT_FOUND',
          { toolName, args }
        );
      }

      // Use user session credentials if provided, otherwise fall back to static config
      const config = userSession || this.config;

      // Validate configuration (except for status check)
      if (toolName !== 'affise_status' && !config) {
        return this.errorHandler.createErrorResponse(
          'Configuration not loaded',
          'CONFIG_MISSING',
          { toolName, args }
        );
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(toolName, args);
      
      // Check cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        return {
          ...cachedResult,
          cache_info: {
            was_cached: true,
            cache_key: cacheKey,
            cache_performance: 'hit'
          }
        };
      }

      // Execute tool with provided credentials
      const result = await this.executeToolHandler(toolName, args, config);

      // Cache successful results
      if (result.status === 'ok') {
        const ttl = this.getCacheTTL(toolName);
        await this.cacheService.set(cacheKey, result, ttl);
      }

      // Add cache info and performance metrics
      const responseTime = Date.now() - startTime;
      return {
        ...result,
        cache_info: {
          was_cached: false,
          cache_key: cacheKey,
          cache_performance: 'miss'
        },
        performance: {
          response_time: responseTime,
          cache_stats: this.cacheService.getStats()
        }
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        error.message,
        'UNKNOWN_ERROR',
        { toolName, args },
        error
      );
    }
  }

  /**
   * Execute tool handler (keeps existing logic)
   */
  private async executeToolHandler(
    toolName: string,
    args: any,
    config?: { baseUrl: string; apiKey: string } | null
  ): Promise<any> {
    switch (toolName) {
      case 'affise_status':
        return await this.handleStatus(config);

      case 'affise_search_offers':
        return await this.handleOfferSearch(args.query, config);

      case 'affise_stats':
        return await this.handleStatsNL(args.query, config);

      case 'affise_stats_raw':
        return await this.handleStatsRaw(args, config);

      case 'affise_offer_categories':
        return await this.handleOfferCategories(args, config);

      case 'affise_trafficback':
        return await this.handleTrafficback(args, config);

      case 'affise_smart_search':
        return await this.handleSmartSearch(args, config);

      case 'affise_conversions_raw':
        return await this.handleConversionsRaw(args, config);

      case 'affise_offer_tracking_link':
        return await this.handleOfferTrackingLink(args, config);

      case 'affise_get_offer':
        return await this.handleGetOffer(args, config);

      case 'affise_list_partners':
        return await this.handleListPartners(args, config);

      case 'affise_get_partner':
        return await this.handleGetPartner(args, config);

      case 'affise_list_advertisers':
        return await this.handleListAdvertisers(args, config);

      case 'affise_get_advertiser':
        return await this.handleGetAdvertiser(args, config);

      case 'affise_retention_rate':
        return await this.handleRetentionRate(args, config);

      case 'affise_time_to_action':
        return await this.handleTimeToAction(args, config);

      case 'affise_get_conversion':
        return await this.handleGetConversion(args, config);

      // === Partner (affiliate) tools — Phase A ===
      case 'affise_partner_profile':
        return await this.handlePartnerProfile(config);

      case 'affise_partner_balance':
        return await this.handlePartnerBalance(config);

      case 'affise_partner_offers':
        return await this.handlePartnerOffers(args, config, 'available');

      case 'affise_partner_live_offers':
        return await this.handlePartnerOffers(args, config, 'live');

      case 'affise_partner_find_subs':
        return await this.handlePartnerFindSubs(args, config);

      case 'affise_partner_news':
        return await this.handlePartnerNews(args, config);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Handle status check (enhanced with validation)
   */
  private async handleStatus(config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    
    if (!cfg) {
      return {
        status: 'error',
        message: 'No configuration provided',
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      const result = await createAffiseStatusTool(cfg);
      return {
        status: result.status,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      console.error(`❌ Status check error:`, error.message);
      return this.errorHandler.createErrorResponse(
        error.message,
        'NETWORK_ERROR',
        { toolName: 'affise_status' },
        error
      );
    }
  }

  /**
   * Handle offer search - UPDATED TO USE UNIFIED SYSTEM
   */
  private async handleOfferSearch(query: string, config?: { baseUrl: string; apiKey: string } | null): Promise<OfferSearchResponse> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_search_offers', args: { query } }
      );
    }

    // Validate input
    const validation = this.validator.validateOfferSearch({ query });
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_search_offers', args: { query } }
      );
    }

    try {
      // Use unified search system with natural language query
      const result = await searchWithNaturalLanguage(cfg, query, {
        userIntent: 'explore',
        maxSampleSize: 50
      });
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'SEARCH_ERROR',
          { toolName: 'affise_search_offers', args: { query } }
        );
      }

      return {
        status: 'ok',
        message: result.message || `Found ${result.itemsRetrieved || 0} offers`,
        offers: result.data || [],
        total_found: result.totalItems || 0,
        has_more_results: result.canContinue || false,
        query_parsed: result.query_parsed,
        search_type: result.search_type,
        insights: result.insights,
        recommendations: result.recommendations,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Search error: ${error.message}`,
        'SEARCH_ERROR',
        { toolName: 'affise_search_offers', args: { query } },
        error
      );
    }
  }

  /**
   * Handle stats with natural language (enhanced)
   */
  private async handleStatsNL(query: string, config?: { baseUrl: string; apiKey: string } | null): Promise<StatsResponse> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_stats', args: { query } }
      );
    }

    // Validate input
    const validation = this.validator.validateStatsQuery({ query });
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_stats', args: { query } }
      );
    }

    try {
      // Use existing logic with enhancements
      const parsed = parseQuery(query);
      const statsParams = toStatsParams(parsed);

      // Multiple explicit date ranges ("from A to B and from C to D") → one
      // pull per range with the SAME slice/fields/filters. The parser only
      // tracks a single range, so without this a two-week ask silently used
      // just the first. Capped at MAX_RANGES pulls to bound cost; extras are
      // dropped with a note.
      const MAX_RANGES = 6;
      const ranges = extractExplicitDateRanges(query);
      if (ranges.length >= 2) {
        const used = ranges.slice(0, MAX_RANGES);
        const periods: any[] = [];
        for (const r of used) {
          const p: any = { ...statsParams, date_from: r.date_from, date_to: r.date_to };
          delete p.period;
          const res = await getAffiseCustomStats(cfg, p);
          if (res.status === 'error') {
            return this.errorHandler.createErrorResponse(
              `Range ${r.date_from}..${r.date_to}: ${res.message}`,
              'STATS_ERROR',
              { toolName: 'affise_stats', args: { query } }
            );
          }
          periods.push({
            date_from: r.date_from,
            date_to: r.date_to,
            data: res.data,
            summary: res.data?.stats ? this.calculateSummary(res.data.stats) : undefined,
          });
        }
        const dropped = ranges.length - used.length;
        const note = dropped > 0
          ? ` (${dropped} additional range(s) dropped; max ${MAX_RANGES} per call)`
          : '';
        return {
          status: 'ok',
          message: `Stats retrieved for ${periods.length} date ranges${note}`,
          data: { multi_period: true, periods } as any,
          timestamp: new Date().toISOString()
        };
      }

      // Handle date range
      if (parsed.date_from && parsed.date_to) {
        statsParams.date_from = parsed.date_from;
        statsParams.date_to = parsed.date_to;
      } else if (parsed.time_period) {
        const dateRange = getDateRange(parsed.time_period as any);
        statsParams.date_from = dateRange.from;
        statsParams.date_to = dateRange.to;
      } else {
        // No silent `last7days` default: an unresolved period used to return a
        // plausible-looking week of whole-account data for a query that asked
        // for something else entirely.
        const token = findDateLikeToken(query);
        return this.errorHandler.createErrorResponse(
          token
            ? `Could not parse the date "${token}". Use YYYY-MM-DD or DD.MM.YYYY for a single day, "from <date> to <date>" for a range, or a named period (today, yesterday, last 7 days, this month).`
            : 'No date or period found in the query. Add a date (YYYY-MM-DD or DD.MM.YYYY), a range ("from <date> to <date>"), or a named period (today, yesterday, last 7 days, last 30 days, this month, last month).',
          'VALIDATION_ERROR',
          { toolName: 'affise_stats', args: { query } }
        );
      }

      const result = await getAffiseCustomStats(cfg, statsParams);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'STATS_ERROR',
          { toolName: 'affise_stats', args: { query } }
        );
      }

      return {
        status: 'ok',
        message: 'Stats retrieved successfully',
        data: result.data,
        metadata: (result as any).metadata,
        summary: result.data?.stats ? this.calculateSummary(result.data.stats) : undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Stats error: ${error.message}`,
        'STATS_ERROR',
        { toolName: 'affise_stats', args: { query } },
        error
      );
    }
  }

  /**
   * Handle raw stats (enhanced with validation)
   */
  private async handleStatsRaw(params: any, config?: { baseUrl: string; apiKey: string } | null): Promise<StatsResponse> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_stats_raw', args: params }
      );
    }

    // Flatten nested `filter` object into top-level params so the existing
    // serializer (which expects flat shape) can pick them up. Callers may pass
    // either { filter: { partner: [...] } } (modern) or { partner: [...] } (legacy).
    if (params.filter && typeof params.filter === 'object' && !Array.isArray(params.filter)) {
      params = { ...params, ...params.filter };
      delete params.filter;
    }

    // Validate and normalize parameters
    const validation = this.validator.validateRawStatsParams(params);
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_stats_raw', args: params }
      );
    }

    try {
      const normalizedParams = this.validator.normalizeStatsParams(params);
      const result = await getAffiseCustomStats(cfg, normalizedParams as any);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'STATS_ERROR',
          { toolName: 'affise_stats_raw', args: params }
        );
      }

      return {
        status: 'ok',
        message: 'Raw stats retrieved successfully',
        data: result.data,
        metadata: (result as any).metadata,
        summary: result.data?.stats ? this.calculateSummary(result.data.stats) : undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Raw stats error: ${error.message}`,
        'STATS_ERROR',
        { toolName: 'affise_stats_raw', args: params },
        error
      );
    }
  }

  /**
   * Handle raw conversions (GET /3.0/stats/conversions).
   * Mirrors handleStatsRaw structure: flatten nested filter → validate → call tool.
   */
  private async handleConversionsRaw(params: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_conversions_raw', args: params }
      );
    }

    // Flatten nested filter object (modern callers pass filter: {...}).
    if (params.filter && typeof params.filter === 'object' && !Array.isArray(params.filter)) {
      params = { ...params, ...params.filter };
      delete params.filter;
    }

    // Legacy alias: affiliate → partner (Conversion.php uses `partner`).
    if (params.affiliate && !params.partner) {
      params.partner = params.affiliate;
      delete params.affiliate;
    }

    if (!params.date_from || !params.date_to) {
      return this.errorHandler.createErrorResponse(
        'date_from and date_to are required',
        'VALIDATION_ERROR',
        { toolName: 'affise_conversions_raw', args: params }
      );
    }

    try {
      const result = await getAffiseConversions(cfg, params);

      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'CONVERSIONS_ERROR',
          { toolName: 'affise_conversions_raw', args: params }
        );
      }

      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Conversions error: ${error.message}`,
        'CONVERSIONS_ERROR',
        { toolName: 'affise_conversions_raw', args: params },
        error
      );
    }
  }

  /**
   * Handle offer tracking link generation (POST /3.0/admin/offer/{offerId}/tracking-link).
   */
  private async handleOfferTrackingLink(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_offer_tracking_link', args }
      );
    }

    if (!args || typeof args !== 'object') {
      return this.errorHandler.createErrorResponse(
        'Invalid arguments',
        'VALIDATION_ERROR',
        { toolName: 'affise_offer_tracking_link', args }
      );
    }

    const offerId = Number(args.offer_id);
    const affiliateId = Number(args.affiliate_id);

    if (!Number.isInteger(offerId) || offerId <= 0) {
      return this.errorHandler.createErrorResponse(
        'offer_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_offer_tracking_link', args }
      );
    }
    if (!Number.isInteger(affiliateId) || affiliateId <= 0) {
      return this.errorHandler.createErrorResponse(
        'affiliate_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_offer_tracking_link', args }
      );
    }

    try {
      const result = await getOfferTrackingLink(cfg, {
        offer_id: offerId,
        affiliate_id: affiliateId,
        sub1: args.sub1,
        sub2: args.sub2,
        sub3: args.sub3,
        sub4: args.sub4,
        sub5: args.sub5,
        sub6: args.sub6,
        sub7: args.sub7,
        sub8: args.sub8,
      });

      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'TRACKING_LINK_ERROR',
          { toolName: 'affise_offer_tracking_link', args }
        );
      }

      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Tracking link error: ${error.message}`,
        'TRACKING_LINK_ERROR',
        { toolName: 'affise_offer_tracking_link', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/offer/{id} — single offer detail.
   */
  private async handleGetOffer(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_get_offer', args }
      );
    }
    const offerId = Number(args?.offer_id);
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return this.errorHandler.createErrorResponse(
        'offer_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_get_offer', args }
      );
    }
    try {
      const result = await getOfferDetail(cfg, { offer_id: offerId });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'OFFER_LOOKUP_ERROR',
          { toolName: 'affise_get_offer', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Offer lookup error: ${error.message}`,
        'OFFER_LOOKUP_ERROR',
        { toolName: 'affise_get_offer', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/admin/partners — paginated affiliate list.
   */
  private async handleListPartners(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_list_partners', args }
      );
    }
    try {
      const result = await listPartners(cfg, args || {});
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_LOOKUP_ERROR',
          { toolName: 'affise_list_partners', args }
        );
      }
      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partners list error: ${error.message}`,
        'PARTNER_LOOKUP_ERROR',
        { toolName: 'affise_list_partners', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/admin/partner/{id} — single affiliate detail.
   */
  private async handleGetPartner(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_get_partner', args }
      );
    }
    const partnerId = Number(args?.partner_id);
    if (!Number.isInteger(partnerId) || partnerId <= 0) {
      return this.errorHandler.createErrorResponse(
        'partner_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_get_partner', args }
      );
    }
    try {
      const result = await getPartner(cfg, { partner_id: partnerId });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_LOOKUP_ERROR',
          { toolName: 'affise_get_partner', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner lookup error: ${error.message}`,
        'PARTNER_LOOKUP_ERROR',
        { toolName: 'affise_get_partner', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/admin/advertisers — paginated advertiser list.
   */
  private async handleListAdvertisers(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_list_advertisers', args }
      );
    }
    try {
      const result = await listAdvertisers(cfg, args || {});
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'ADVERTISER_LOOKUP_ERROR',
          { toolName: 'affise_list_advertisers', args }
        );
      }
      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Advertisers list error: ${error.message}`,
        'ADVERTISER_LOOKUP_ERROR',
        { toolName: 'affise_list_advertisers', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/admin/advertiser/{id} — single advertiser detail.
   */
  private async handleGetAdvertiser(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_get_advertiser', args }
      );
    }
    const advertiserId = String(args?.advertiser_id || '');
    if (!/^[a-fA-F0-9]{24}$/.test(advertiserId)) {
      return this.errorHandler.createErrorResponse(
        'advertiser_id is required and must be a 24-char hex MongoId',
        'VALIDATION_ERROR',
        { toolName: 'affise_get_advertiser', args }
      );
    }
    try {
      const result = await getAdvertiser(cfg, { advertiser_id: advertiserId });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'ADVERTISER_LOOKUP_ERROR',
          { toolName: 'affise_get_advertiser', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Advertiser lookup error: ${error.message}`,
        'ADVERTISER_LOOKUP_ERROR',
        { toolName: 'affise_get_advertiser', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/stats/retentionrate — cohort retention.
   */
  private async handleRetentionRate(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_retention_rate', args }
      );
    }
    if (!args?.date_from || !args?.date_to) {
      return this.errorHandler.createErrorResponse(
        'date_from and date_to are required (YYYY-MM-DD)',
        'VALIDATION_ERROR',
        { toolName: 'affise_retention_rate', args }
      );
    }
    const offerId = Number(args?.offer_id);
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return this.errorHandler.createErrorResponse(
        'offer_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_retention_rate', args }
      );
    }
    if (!args?.base_event || typeof args.base_event !== 'string') {
      return this.errorHandler.createErrorResponse(
        'base_event is required (event name string)',
        'VALIDATION_ERROR',
        { toolName: 'affise_retention_rate', args }
      );
    }
    if (!Array.isArray(args?.events) || args.events.length === 0
        || !args.events.every((e: any) => typeof e === 'string' && e.length > 0)) {
      return this.errorHandler.createErrorResponse(
        'events is required and must be a non-empty array of event-name strings',
        'VALIDATION_ERROR',
        { toolName: 'affise_retention_rate', args }
      );
    }
    try {
      const result = await getRetentionRate(cfg, {
        date_from:    args.date_from,
        date_to:      args.date_to,
        offer_id:     offerId,
        base_event:   args.base_event,
        events:       args.events,
        timezone:     args.timezone,
        affiliate_id: args.affiliate_id !== undefined ? Number(args.affiliate_id) : undefined,
        describe:     args.describe,
        page:         args.page,
        limit:        args.limit,
      });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'RETENTION_ERROR',
          { toolName: 'affise_retention_rate', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Retention rate error: ${error.message}`,
        'RETENTION_ERROR',
        { toolName: 'affise_retention_rate', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/stats/time-to-action — click→conversion latency.
   */
  private async handleTimeToAction(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_time_to_action', args }
      );
    }
    if (!args?.date_from || !args?.date_to) {
      return this.errorHandler.createErrorResponse(
        'date_from and date_to are required',
        'VALIDATION_ERROR',
        { toolName: 'affise_time_to_action', args }
      );
    }
    const offerId = Number(args?.offer_id);
    if (!Number.isInteger(offerId) || offerId <= 0) {
      return this.errorHandler.createErrorResponse(
        'offer_id is required and must be a positive integer',
        'VALIDATION_ERROR',
        { toolName: 'affise_time_to_action', args }
      );
    }
    try {
      const result = await getTimeToAction(cfg, {
        date_from:     args.date_from,
        date_to:       args.date_to,
        offer_id:      offerId,
        timezone:      args.timezone,
        affiliate_ids: args.affiliate_ids,
        goal:          args.goal,
        page:          args.page,
        limit:         args.limit,
      });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'TIME_TO_ACTION_ERROR',
          { toolName: 'affise_time_to_action', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Time-to-action error: ${error.message}`,
        'TIME_TO_ACTION_ERROR',
        { toolName: 'affise_time_to_action', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/stats/conversionsbyid — single conversion drill-down.
   */
  private async handleGetConversion(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_get_conversion', args }
      );
    }
    const id = String(args?.id || '');
    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return this.errorHandler.createErrorResponse(
        'id is required and must be a 24-char hex MongoId',
        'VALIDATION_ERROR',
        { toolName: 'affise_get_conversion', args }
      );
    }
    try {
      const result = await getConversionById(cfg, { id, timezone: args.timezone });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'CONVERSION_LOOKUP_ERROR',
          { toolName: 'affise_get_conversion', args }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Conversion lookup error: ${error.message}`,
        'CONVERSION_LOOKUP_ERROR',
        { toolName: 'affise_get_conversion', args },
        error
      );
    }
  }

  // === Partner (affiliate) handlers — Phase A ===

  /**
   * Handle GET /3.1/partner/me — partner's own profile.
   */
  private async handlePartnerProfile(config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_partner_profile' }
      );
    }
    try {
      const result = await getPartnerProfile(cfg);
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_API_ERROR',
          { toolName: 'affise_partner_profile' }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner profile error: ${error.message}`,
        'PARTNER_API_ERROR',
        { toolName: 'affise_partner_profile' },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/balance — partner's multi-currency balance.
   */
  private async handlePartnerBalance(config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_partner_balance' }
      );
    }
    try {
      const result = await getPartnerBalance(cfg);
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_API_ERROR',
          { toolName: 'affise_partner_balance' }
        );
      }
      return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner balance error: ${error.message}`,
        'PARTNER_API_ERROR',
        { toolName: 'affise_partner_balance' },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/partner/offers and /3.0/partner/live-offers.
   * `mode = 'available' | 'live'` dispatches to the right tool function.
   */
  private async handlePartnerOffers(
    args: any,
    config: { baseUrl: string; apiKey: string } | null | undefined,
    mode: 'available' | 'live',
  ): Promise<any> {
    const cfg = config || this.config;
    const toolName = mode === 'available' ? 'affise_partner_offers' : 'affise_partner_live_offers';
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName, args }
      );
    }
    try {
      const fn = mode === 'available' ? listPartnerOffers : listPartnerLiveOffers;
      const result = await fn(cfg, args || {});
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_API_ERROR',
          { toolName, args }
        );
      }
      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner ${mode} offers error: ${error.message}`,
        'PARTNER_API_ERROR',
        { toolName, args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/stats/find-subs — distinct sub-values discovery.
   */
  private async handlePartnerFindSubs(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_partner_find_subs', args }
      );
    }
    const validKeys = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;
    if (!args?.sub_key || !validKeys.includes(args.sub_key)) {
      return this.errorHandler.createErrorResponse(
        'sub_key is required and must be one of: sub1, sub2, sub3, sub4, sub5',
        'VALIDATION_ERROR',
        { toolName: 'affise_partner_find_subs', args }
      );
    }
    try {
      const result = await findPartnerSubs(cfg, {
        sub_key:   args.sub_key,
        sub_value: args.sub_value,
        page:      args.page,
        limit:     args.limit,
      });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_API_ERROR',
          { toolName: 'affise_partner_find_subs', args }
        );
      }
      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner find-subs error: ${error.message}`,
        'PARTNER_API_ERROR',
        { toolName: 'affise_partner_find_subs', args },
        error
      );
    }
  }

  /**
   * Handle GET /3.0/news — partner-visible announcements.
   */
  private async handlePartnerNews(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_partner_news', args }
      );
    }
    try {
      const result = await listPartnerNews(cfg, {
        limit:        args?.limit,
        skip:         args?.skip,
        fixed:        args?.fixed,
        strip_images: args?.strip_images,
      });
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'PARTNER_API_ERROR',
          { toolName: 'affise_partner_news', args }
        );
      }
      return {
        status: 'ok',
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Partner news error: ${error.message}`,
        'PARTNER_API_ERROR',
        { toolName: 'affise_partner_news', args },
        error
      );
    }
  }

  /**
   * Handle offer categories (keep existing logic)
   */
  private async handleOfferCategories(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_offer_categories', args }
      );
    }

    try {
      const params: any = {
        page: args.page || 1,
        limit: args.limit || 100,
        order: args.order || 'id',
        orderType: args.orderType || 'asc'
      };

      if (args.ids && Array.isArray(args.ids)) {
        params.ids = args.ids;
      }

      const result = await getOfferCategories(cfg, params);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'CATEGORIES_ERROR',
          { toolName: 'affise_offer_categories', args }
        );
      }
      
      let categories = result.data?.categories || [];
      
      // Apply search filter if provided
      if (args.search && typeof args.search === 'string') {
        categories = searchCategoriesByTitle(categories, args.search);
      }
      
      return {
        status: 'ok',
        message: `Found ${categories.length} categories`,
        data: {
          categories,
          total: categories.length,
          search_applied: args.search || null
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Categories error: ${error.message}`,
        'CATEGORIES_ERROR',
        { toolName: 'affise_offer_categories', args },
        error
      );
    }
  }

  /**
   * Handle trafficback (keep existing logic)
   */
  private async handleTrafficback(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_trafficback', args }
      );
    }

    try {
      // Handle date range
      let dateFrom = args.date_from;
      let dateTo = args.date_to;

      if (args.period) {
        const dateRange = getDateRange(args.period);
        dateFrom = dateRange.from;
        dateTo = dateRange.to;
      } else if (!dateFrom || !dateTo) {
        const dateRange = getDateRange('last7days');
        dateFrom = dateRange.from;
        dateTo = dateRange.to;
      }

      const params: any = {
        date_from: dateFrom,
        date_to: dateTo,
        page: args.page || 1,
        limit: args.limit || 100,
        orderType: args.orderType || 'desc'
      };

      // Add optional filters
      const filterFields = ['country', 'offer', 'advertiser', 'partner', 'device', 'os'];
      filterFields.forEach(field => {
        if (args[field] && Array.isArray(args[field])) {
          params[field] = args[field];
        }
      });

      const result = await getTrafficbackStats(cfg, params);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'TRAFFICBACK_ERROR',
          { toolName: 'affise_trafficback', args }
        );
      }
      
      return {
        status: 'ok',
        message: result.message || 'Trafficback stats retrieved successfully',
        data: result.data,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Trafficback error: ${error.message}`,
        'TRAFFICBACK_ERROR',
        { toolName: 'affise_trafficback', args },
        error
      );
    }
  }

  /**
   * Handle smart search - UPDATED TO USE UNIFIED SYSTEM
   */
  private async handleSmartSearch(args: any, config?: { baseUrl: string; apiKey: string } | null): Promise<any> {
    // Use provided config or fall back to instance config
    const cfg = config || this.config;
    if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
      return this.errorHandler.createErrorResponse(
        'Configuration not loaded - baseUrl or apiKey missing',
        'CONFIG_MISSING',
        { toolName: 'affise_smart_search', args }
      );
    }

    // Validate input
    const validation = this.validator.validateSmartSearch(args);
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_smart_search', args }
      );
    }

    try {
      // Build unified search parameters
      const searchParams: any = {
        query: args.query
      };

      // Add structured parameters if provided
      if (args.categories || args.countries) {
        searchParams.structured = {};

        if (args.categories && Array.isArray(args.categories)) {
          searchParams.structured.categories = args.categories;
        }

        if (args.countries && Array.isArray(args.countries)) {
          searchParams.structured.countries = args.countries;
        }
      }

      // Set search options
      searchParams.options = {
        userIntent: 'analyze',
        maxSampleSize: 100,
        autoComplete: false
      };

      const result = await unifiedSearchOffers(cfg, searchParams);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'SEARCH_ERROR',
          { toolName: 'affise_smart_search', args }
        );
      }
      
      return {
        status: 'ok',
        message: result.message || 'Smart search completed successfully',
        data: {
          offers: result.data || [],
          total_found: result.totalItems || 0,
          search_type: result.search_type,
          query_parsed: result.query_parsed,
          insights: result.insights,
          recommendations: result.recommendations,
          can_continue: result.canContinue || false
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Smart search error: ${error.message}`,
        'SEARCH_ERROR',
        { toolName: 'affise_smart_search', args },
        error
      );
    }
  }

  /**
   * Calculate summary metrics (keep existing logic)
   */
  private calculateSummary(stats: any[]): { total_records: number; key_metrics: Record<string, number> } {
    if (!stats || stats.length === 0) {
      return {
        total_records: 0,
        key_metrics: {}
      };
    }
    
    const totals = stats.reduce((acc, stat) => {
      acc.revenue += parseFloat(stat.income) || 0;
      acc.conversions += parseInt(stat.conversions) || 0;
      acc.clicks += parseInt(stat.clicks) || 0;
      return acc;
    }, { revenue: 0, conversions: 0, clicks: 0 });
    
    return {
      total_records: stats.length,
      key_metrics: {
        total_revenue: totals.revenue,
        total_conversions: totals.conversions,
        total_clicks: totals.clicks,
        conversion_rate: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0
      }
    };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(toolName: string, args: any): string {
    return `${toolName}:${this.hashString(stableStringify(args))}`;
  }

  /**
   * Get cache TTL for specific tool
   */
  private getCacheTTL(toolName: string): number {
    const cacheTTLs: Record<string, number> = {
      'affise_status': 60000,           // 1 minute
      'affise_offer_categories': 600000, // 10 minutes
      'affise_search_offers': 300000,   // 5 minutes
      'affise_stats': 180000,           // 3 minutes
      'affise_stats_raw': 180000,       // 3 minutes
      'affise_trafficback': 300000,     // 5 minutes
      'affise_smart_search': 300000,    // 5 minutes
      'affise_conversions_raw': 120000, // 2 minutes — raw conversions are
                                        // more time-sensitive than aggregates
      'affise_offer_tracking_link': 600000, // 10 minutes — link is deterministic
                                            // per (offer, affiliate, sub*) tuple
      // Entity lookups: details rarely change; lists may change more often.
      'affise_get_offer': 600000,           // 10 min
      'affise_list_partners': 180000,       // 3 min
      'affise_get_partner': 600000,         // 10 min
      'affise_list_advertisers': 180000,    // 3 min
      'affise_get_advertiser': 600000,      // 10 min
      // Stats analytics — cohort & timing data is slow-changing.
      'affise_retention_rate':  600000,     // 10 min
      'affise_time_to_action':  300000,     // 5 min
      'affise_get_conversion':  600000,     // 10 min — single conversion is immutable
      // Partner Phase A — match expected change rates per endpoint.
      'affise_partner_profile':     300000,  // 5 min — profile rarely changes within a session
      'affise_partner_balance':     60000,   // 1 min — balance ticks fast on activity
      'affise_partner_offers':      600000,  // 10 min — catalog changes infrequently
      'affise_partner_live_offers': 300000,  // 5 min — connections can flip
      'affise_partner_find_subs':   60000,   // 1 min — new sub values appear with traffic
      'affise_partner_news':        1800000  // 30 min — announcements rarely change
    };
    
    return cacheTTLs[toolName] || 300000; // Default 5 minutes
  }

  private hashString(str: string): string {
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
    return {
      cache: this.cacheService.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cacheService.destroy();
  }
}

/**
 * Setup enhanced handlers (drop-in replacement)
 */
export function setupEnhancedHandlers(
  server: Server,
  config: { baseUrl: string; apiKey: string } | null
): void {
  const toolHandler = new EnhancedToolHandler(config);

  // Store current request's userSession in a WeakMap keyed by server
  // This allows us to pass userSession from router to handler
  const userSessionStore = new WeakMap<any, { baseUrl: string; apiKey: string }>();
  (server as any).__userSessionStore = userSessionStore;

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Extract user session from context if available (multiple strategies)
    let userSession = (request as any)._userSession;

    // Strategy 2: Check if router stored it on the server object
    if (!userSession && (server as any).__currentUserSession) {
      userSession = (server as any).__currentUserSession;
    }

    // Strategy 3: Check the request object itself for session data
    if (!userSession && (request as any).userSession) {
      userSession = (request as any).userSession;
    }

    try {
      // Pass user session to tool handler
      const result = await toolHandler.executeTool(name, args || {}, userSession);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
      
    } catch (error: any) {
      // Spec: tool execution failures set isError so hosts/clients can
      // distinguish a thrown failure from a tool that returned a payload
      // describing an error condition.
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            message: `Unexpected error: ${error.message}`,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }
  });
}

/**
 * Legacy compatibility
 */
export function setupSimpleHandlers(
  server: Server, 
  config: { baseUrl: string; apiKey: string } | null
): void {
  setupEnhancedHandlers(server, config);
}

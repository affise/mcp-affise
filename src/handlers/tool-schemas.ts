/**
 * Tool schema registry — one entry per public Affise MCP tool.
 *
 * Each entry mirrors what `McpServer.registerTool` consumes:
 *   { title, description, inputSchema (ZodRawShape), outputSchema? }
 *
 * The per-tool definitions live in category modules under `./schemas/`,
 * one file per natural grouping (NL-driven tools, admin analytics,
 * conversions, admin entities, partner-role tools). This file is just an
 * aggregator that re-keys them by wire name into `TOOL_SCHEMAS`.
 *
 * Why group instead of one-file-per-tool: 25 single-export files would
 * explode without giving extra discoverability — the categories already
 * carve up the catalogue along the same axis the Affise REST API does.
 */

import {
  affise_status,
  affise_search_offers,
  affise_stats,
  affise_smart_search,
} from './schemas/nl.js';
import {
  affise_stats_raw,
  affise_stats_compare,
  affise_trafficback,
  affise_retention_rate,
  affise_time_to_action,
  affise_affiliate_analysis,
} from './schemas/admin-analytics.js';
import {
  affise_conversions_raw,
  affise_get_conversion,
} from './schemas/conversions.js';
import {
  affise_offer_categories,
  affise_get_offer,
  affise_list_partners,
  affise_get_partner,
  affise_list_advertisers,
  affise_get_advertiser,
  affise_offer_tracking_link,
} from './schemas/admin-entities.js';
import {
  affise_partner_profile,
  affise_partner_balance,
  affise_partner_offers,
  affise_partner_live_offers,
  affise_partner_find_subs,
  affise_partner_news,
} from './schemas/partner.js';

export const TOOL_SCHEMAS = {
  // NL / status
  affise_status,
  affise_search_offers,
  affise_stats,
  affise_smart_search,
  // Admin analytics
  affise_stats_raw,
  affise_stats_compare,
  affise_trafficback,
  affise_retention_rate,
  affise_time_to_action,
  affise_affiliate_analysis,
  // Conversions
  affise_conversions_raw,
  affise_get_conversion,
  // Admin entities + lookup
  affise_offer_categories,
  affise_get_offer,
  affise_list_partners,
  affise_get_partner,
  affise_list_advertisers,
  affise_get_advertiser,
  affise_offer_tracking_link,
  // Partner-role (require partner API key)
  affise_partner_profile,
  affise_partner_balance,
  affise_partner_offers,
  affise_partner_live_offers,
  affise_partner_find_subs,
  affise_partner_news,
} as const;

export type AffiseToolName = keyof typeof TOOL_SCHEMAS;

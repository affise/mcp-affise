/**
 * HANDLER_REGISTRY — tool name → handler function map.
 *
 * The orchestrator (EnhancedToolHandler.executeToolHandler) used to be a
 * 70-line switch over 22 cases pointing at private `this.handle*` methods.
 * Tier 5.4 extracted those methods into per-category free functions; this
 * aggregator wires them back together so the dispatch becomes a single
 * `HANDLER_REGISTRY[name]?.(args, config, deps)` lookup.
 *
 * Adding a new tool now means:
 *   1. Add a schema entry under `src/handlers/schemas/`.
 *   2. Add a handler function under `src/handlers/tools/<category>.ts`.
 *   3. Add one line here.
 */

import type { ToolHandler } from './_types.js';
import {
  handleOfferSearch,
  handleStatsNL,
  handleSmartSearch,
} from './nl.js';
import {
  handleStatsRaw,
  handleStatsCompare,
  handleTrafficback,
  handleRetentionRate,
  handleTimeToAction,
  handleAffiliateAnalysis,
} from './admin-analytics.js';
import {
  handleConversionsRaw,
  handleGetConversion,
} from './conversions.js';
import {
  handleOfferCategories,
  handleGetOffer,
  handleListPartners,
  handleGetPartner,
  handleListAdvertisers,
  handleGetAdvertiser,
  handleOfferTrackingLink,
} from './admin-entities.js';
import {
  handlePartnerProfile,
  handlePartnerBalance,
  handlePartnerOffers,
  handlePartnerLiveOffers,
  handlePartnerFindSubs,
  handlePartnerNews,
} from './partner.js';

export const HANDLER_REGISTRY: Record<string, ToolHandler> = {
  // NL
  affise_search_offers:        handleOfferSearch,
  affise_stats:                handleStatsNL,
  affise_smart_search:         handleSmartSearch,
  // Admin analytics
  affise_stats_raw:            handleStatsRaw,
  affise_stats_compare:        handleStatsCompare,
  affise_trafficback:          handleTrafficback,
  affise_retention_rate:       handleRetentionRate,
  affise_time_to_action:       handleTimeToAction,
  affise_affiliate_analysis:   handleAffiliateAnalysis,
  // Conversions
  affise_conversions_raw:      handleConversionsRaw,
  affise_get_conversion:       handleGetConversion,
  // Admin entities + lookup
  affise_offer_categories:     handleOfferCategories,
  affise_get_offer:            handleGetOffer,
  affise_list_partners:        handleListPartners,
  affise_get_partner:          handleGetPartner,
  affise_list_advertisers:     handleListAdvertisers,
  affise_get_advertiser:       handleGetAdvertiser,
  affise_offer_tracking_link:  handleOfferTrackingLink,
  // Partner-role
  affise_partner_profile:      handlePartnerProfile,
  affise_partner_balance:      handlePartnerBalance,
  affise_partner_offers:       handlePartnerOffers,
  affise_partner_live_offers:  handlePartnerLiveOffers,
  affise_partner_find_subs:    handlePartnerFindSubs,
  affise_partner_news:         handlePartnerNews,
};

export type { ToolHandler, HandlerDeps, AffiseConfig } from './_types.js';

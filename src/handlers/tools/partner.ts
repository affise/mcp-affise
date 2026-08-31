/**
 * Handlers for partner (affiliate-role) tools — Phase A: read-only essentials.
 *
 *   affise_partner_profile      — /3.1/partner/me
 *   affise_partner_balance      — /3.0/balance
 *   affise_partner_offers       — /3.0/partner/offers
 *   affise_partner_live_offers  — /3.0/partner/live-offers
 *   affise_partner_find_subs    — /3.0/stats/find-subs
 *   affise_partner_news         — /3.0/news
 *
 * Every one requires a partner API key. Admin keys return 403 from
 * the underlying Affise endpoint.
 */

import { getPartnerProfile } from '../../tools/affise_partner_profile.js';
import { getPartnerBalance } from '../../tools/affise_partner_balance.js';
import { listPartnerOffers, listPartnerLiveOffers } from '../../tools/affise_partner_offers.js';
import { findPartnerSubs } from '../../tools/affise_partner_find_subs.js';
import { listPartnerNews } from '../../tools/affise_partner_news.js';
import type { AffiseConfig, HandlerDeps, ToolHandler } from './_types.js';

export const handlePartnerProfile: ToolHandler = async (_args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_partner_profile' }
    );
  }
  try {
    const result = await getPartnerProfile(config);
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_API_ERROR',
        { toolName: 'affise_partner_profile' }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Partner profile error: ${error.message}`, 'PARTNER_API_ERROR',
      { toolName: 'affise_partner_profile' }, error
    );
  }
};

export const handlePartnerBalance: ToolHandler = async (_args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_partner_balance' }
    );
  }
  try {
    const result = await getPartnerBalance(config);
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_API_ERROR',
        { toolName: 'affise_partner_balance' }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Partner balance error: ${error.message}`, 'PARTNER_API_ERROR',
      { toolName: 'affise_partner_balance' }, error
    );
  }
};

/**
 * Shared implementation for affise_partner_offers / _live_offers. The two
 * tools take the same args and return the same shape; they only differ in
 * the underlying API endpoint (`mode = 'available'` → /partner/offers,
 * `mode = 'live'` → /partner/live-offers).
 */
async function partnerOffersImpl(
  mode: 'available' | 'live',
  args: any,
  config: AffiseConfig,
  deps: HandlerDeps
): Promise<any> {
  const toolName = mode === 'available' ? 'affise_partner_offers' : 'affise_partner_live_offers';
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName, args }
    );
  }
  try {
    const fn = mode === 'available' ? listPartnerOffers : listPartnerLiveOffers;
    const result = await fn(config, args || {});
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_API_ERROR',
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
    return deps.errorHandler.createErrorResponse(
      `Partner ${mode} offers error: ${error.message}`,
      'PARTNER_API_ERROR', { toolName, args }, error
    );
  }
}

export const handlePartnerOffers: ToolHandler = (args, config, deps) =>
  partnerOffersImpl('available', args, config, deps);

export const handlePartnerLiveOffers: ToolHandler = (args, config, deps) =>
  partnerOffersImpl('live', args, config, deps);

export const handlePartnerFindSubs: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_partner_find_subs', args }
    );
  }
  const validKeys = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'] as const;
  if (!args?.sub_key || !validKeys.includes(args.sub_key)) {
    return deps.errorHandler.createErrorResponse(
      'sub_key is required and must be one of: sub1, sub2, sub3, sub4, sub5',
      'VALIDATION_ERROR', { toolName: 'affise_partner_find_subs', args }
    );
  }
  try {
    const result = await findPartnerSubs(config, {
      sub_key:   args.sub_key,
      sub_value: args.sub_value,
      page:      args.page,
      limit:     args.limit,
    });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_API_ERROR',
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
    return deps.errorHandler.createErrorResponse(
      `Partner find-subs error: ${error.message}`, 'PARTNER_API_ERROR',
      { toolName: 'affise_partner_find_subs', args }, error
    );
  }
};

export const handlePartnerNews: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_partner_news', args }
    );
  }
  try {
    const result = await listPartnerNews(config, {
      limit:        args?.limit,
      skip:         args?.skip,
      fixed:        args?.fixed,
      strip_images: args?.strip_images,
    });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_API_ERROR',
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
    return deps.errorHandler.createErrorResponse(
      `Partner news error: ${error.message}`, 'PARTNER_API_ERROR',
      { toolName: 'affise_partner_news', args }, error
    );
  }
};

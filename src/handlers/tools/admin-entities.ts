/**
 * Handlers for admin-side entity catalogue + lookup tools.
 *
 *  affise_offer_categories     — /3.0/offer/categories
 *  affise_get_offer            — /3.0/offer/{id}
 *  affise_list_partners        — /3.0/admin/partners
 *  affise_get_partner          — /3.0/admin/partner/{id}
 *  affise_list_advertisers     — /3.0/admin/advertisers
 *  affise_get_advertiser       — /3.0/admin/advertiser/{id}
 *  affise_offer_tracking_link  — /3.0/admin/offer/{offerId}/tracking-link
 */

import { getOfferCategories, searchCategoriesByTitle } from '../../tools/affise_offer_categories.js';
import { getOfferDetail } from '../../tools/affise_offer_detail.js';
import { listPartners, getPartner } from '../../tools/affise_partners.js';
import { listAdvertisers, getAdvertiser } from '../../tools/affise_advertisers.js';
import { getOfferTrackingLink } from '../../tools/affise_offer_tracking_link.js';
import type { ToolHandler } from './_types.js';

export const handleOfferCategories: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_offer_categories', args }
    );
  }
  try {
    const params: any = {
      page:      args.page || 1,
      limit:     args.limit || 100,
      order:     args.order || 'id',
      orderType: args.orderType || 'asc',
    };
    if (args.ids && Array.isArray(args.ids)) params.ids = args.ids;

    const result = await getOfferCategories(config, params);

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'CATEGORIES_ERROR',
        { toolName: 'affise_offer_categories', args }
      );
    }

    let categories = result.data?.categories || [];
    if (args.search && typeof args.search === 'string') {
      categories = searchCategoriesByTitle(categories, args.search);
    }

    return {
      status: 'ok',
      message: `Found ${categories.length} categories`,
      data: {
        categories,
        total: categories.length,
        search_applied: args.search || null,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Categories error: ${error.message}`, 'CATEGORIES_ERROR',
      { toolName: 'affise_offer_categories', args }, error
    );
  }
};

export const handleGetOffer: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_get_offer', args }
    );
  }
  const offerId = Number(args?.offer_id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'offer_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_get_offer', args }
    );
  }
  try {
    const result = await getOfferDetail(config, { offer_id: offerId });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'OFFER_LOOKUP_ERROR',
        { toolName: 'affise_get_offer', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Offer lookup error: ${error.message}`, 'OFFER_LOOKUP_ERROR',
      { toolName: 'affise_get_offer', args }, error
    );
  }
};

export const handleListPartners: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_list_partners', args }
    );
  }
  try {
    const result = await listPartners(config, args || {});
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_LOOKUP_ERROR',
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
    return deps.errorHandler.createErrorResponse(
      `Partners list error: ${error.message}`, 'PARTNER_LOOKUP_ERROR',
      { toolName: 'affise_list_partners', args }, error
    );
  }
};

export const handleGetPartner: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_get_partner', args }
    );
  }
  const partnerId = Number(args?.partner_id);
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'partner_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_get_partner', args }
    );
  }
  try {
    const result = await getPartner(config, { partner_id: partnerId });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'PARTNER_LOOKUP_ERROR',
        { toolName: 'affise_get_partner', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Partner lookup error: ${error.message}`, 'PARTNER_LOOKUP_ERROR',
      { toolName: 'affise_get_partner', args }, error
    );
  }
};

export const handleListAdvertisers: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_list_advertisers', args }
    );
  }
  try {
    const result = await listAdvertisers(config, args || {});
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'ADVERTISER_LOOKUP_ERROR',
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
    return deps.errorHandler.createErrorResponse(
      `Advertisers list error: ${error.message}`, 'ADVERTISER_LOOKUP_ERROR',
      { toolName: 'affise_list_advertisers', args }, error
    );
  }
};

export const handleGetAdvertiser: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_get_advertiser', args }
    );
  }
  const advertiserId = String(args?.advertiser_id || '');
  if (!/^[a-fA-F0-9]{24}$/.test(advertiserId)) {
    return deps.errorHandler.createErrorResponse(
      'advertiser_id is required and must be a 24-char hex MongoId',
      'VALIDATION_ERROR', { toolName: 'affise_get_advertiser', args }
    );
  }
  try {
    const result = await getAdvertiser(config, { advertiser_id: advertiserId });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'ADVERTISER_LOOKUP_ERROR',
        { toolName: 'affise_get_advertiser', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Advertiser lookup error: ${error.message}`, 'ADVERTISER_LOOKUP_ERROR',
      { toolName: 'affise_get_advertiser', args }, error
    );
  }
};

export const handleOfferTrackingLink: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_offer_tracking_link', args }
    );
  }
  if (!args || typeof args !== 'object') {
    return deps.errorHandler.createErrorResponse(
      'Invalid arguments', 'VALIDATION_ERROR',
      { toolName: 'affise_offer_tracking_link', args }
    );
  }
  const offerId = Number(args.offer_id);
  const affiliateId = Number(args.affiliate_id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'offer_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_offer_tracking_link', args }
    );
  }
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'affiliate_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_offer_tracking_link', args }
    );
  }
  try {
    const result = await getOfferTrackingLink(config, {
      offer_id:     offerId,
      affiliate_id: affiliateId,
      sub1: args.sub1, sub2: args.sub2, sub3: args.sub3, sub4: args.sub4,
      sub5: args.sub5, sub6: args.sub6, sub7: args.sub7, sub8: args.sub8,
    });
    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'TRACKING_LINK_ERROR',
        { toolName: 'affise_offer_tracking_link', args }
      );
    }
    return {
      status: 'ok',
      message: result.message,
      data: result.data,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Tracking link error: ${error.message}`, 'TRACKING_LINK_ERROR',
      { toolName: 'affise_offer_tracking_link', args }, error
    );
  }
};

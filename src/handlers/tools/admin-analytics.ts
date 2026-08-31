/**
 * Handlers for the four admin-side analytics tools:
 *   affise_stats_raw       — /3.0/stats/custom
 *   affise_trafficback     — /3.0/stats/trafficback
 *   affise_retention_rate  — /3.0/stats/retentionrate
 *   affise_time_to_action  — /3.0/stats/time-to-action
 */

import { getAffiseCustomStats } from '../../tools/affise_custom_stats.js';
import { compareStats } from '../../tools/affise_stats_compare.js';
import { getTrafficbackStats } from '../../tools/affise_trafficback.js';
import { getRetentionRate } from '../../tools/affise_retention.js';
import { getTimeToAction } from '../../tools/affise_time_to_action.js';
import { getAffiliateAnalysis } from '../../tools/affise_affiliate_analysis.js';
import { StatsResponse } from '../../types/api-responses.js';
import { getDateRange } from '../../shared/date-utils.js';
import { calculateSummary } from './_helpers.js';
import type { ToolHandler } from './_types.js';

export const handleStatsRaw: ToolHandler = async (rawParams, config, deps): Promise<StatsResponse> => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_stats_raw', args: rawParams }
    );
  }

  // Flatten nested `filter` object into top-level params so the existing
  // serializer (which expects flat shape) can pick them up. Callers may pass
  // either { filter: { partner: [...] } } (modern) or { partner: [...] } (legacy).
  let params: any = rawParams;
  if (params.filter && typeof params.filter === 'object' && !Array.isArray(params.filter)) {
    params = { ...params, ...params.filter };
    delete params.filter;
  }

  const validation = deps.validator.validateRawStatsParams(params);
  if (!validation.isValid) {
    return deps.errorHandler.createErrorResponse(
      validation.errors.join(', '), 'VALIDATION_ERROR',
      { toolName: 'affise_stats_raw', args: params }
    );
  }

  try {
    const normalizedParams = deps.validator.normalizeStatsParams(params);
    const result = await getAffiseCustomStats(config, normalizedParams as any);

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'STATS_ERROR',
        { toolName: 'affise_stats_raw', args: params }
      );
    }

    return {
      status: 'ok',
      message: 'Raw stats retrieved successfully',
      data: result.data,
      metadata: (result as any).metadata,
      summary: result.data?.stats ? calculateSummary(result.data.stats) : undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Raw stats error: ${error.message}`, 'STATS_ERROR',
      { toolName: 'affise_stats_raw', args: params }, error
    );
  }
};

export const handleStatsCompare: ToolHandler = async (rawParams, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_stats_compare', args: rawParams }
    );
  }

  try {
    const result = await compareStats(config, {
      period: rawParams?.period,
      date_from: rawParams?.date_from,
      date_to: rawParams?.date_to,
      fields: rawParams?.fields,
      filter: rawParams?.filter,
      includeToday: rawParams?.includeToday,
      timezone: rawParams?.timezone,
    });

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'STATS_ERROR',
        { toolName: 'affise_stats_compare', args: rawParams }
      );
    }

    return {
      status: 'ok',
      message: result.message,
      data: result.data,
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Stats compare error: ${error.message}`, 'STATS_ERROR',
      { toolName: 'affise_stats_compare', args: rawParams }, error
    );
  }
};

export const handleTrafficback: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_trafficback', args }
    );
  }

  try {
    let dateFrom = args.date_from;
    let dateTo = args.date_to;
    if (args.period) {
      const dateRange = getDateRange(args.period);
      dateFrom = dateRange.from;
      dateTo   = dateRange.to;
    } else if (!dateFrom || !dateTo) {
      const dateRange = getDateRange('last7days');
      dateFrom = dateRange.from;
      dateTo   = dateRange.to;
    }

    const params: any = {
      date_from: dateFrom,
      date_to:   dateTo,
      page:      args.page || 1,
      limit:     args.limit || 100,
      orderType: args.orderType || 'desc',
    };

    ['country', 'offer', 'advertiser', 'partner', 'device', 'os'].forEach((field) => {
      if (args[field] && Array.isArray(args[field])) params[field] = args[field];
    });

    const result = await getTrafficbackStats(config, params);

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'TRAFFICBACK_ERROR',
        { toolName: 'affise_trafficback', args }
      );
    }

    return {
      status: 'ok',
      message: result.message || 'Trafficback stats retrieved successfully',
      data: result.data,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Trafficback error: ${error.message}`, 'TRAFFICBACK_ERROR',
      { toolName: 'affise_trafficback', args }, error
    );
  }
};

export const handleAffiliateAnalysis: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_affiliate_analysis', args }
    );
  }
  const partnerId = Number(args?.partner_id);
  if (!Number.isInteger(partnerId) || partnerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'partner_id is required and must be a positive integer (resolve logins via affise_list_partners first)',
      'VALIDATION_ERROR', { toolName: 'affise_affiliate_analysis', args }
    );
  }

  try {
    const result = await getAffiliateAnalysis(config, {
      partner_id: partnerId,
      date_from:  args.date_from,
      date_to:    args.date_to,
      period:     args.period,
      limit:      args.limit !== undefined ? Number(args.limit) : undefined,
    });

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'AFFILIATE_ANALYSIS_ERROR',
        { toolName: 'affise_affiliate_analysis', args }
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
      `Affiliate analysis error: ${error.message}`, 'AFFILIATE_ANALYSIS_ERROR',
      { toolName: 'affise_affiliate_analysis', args }, error
    );
  }
};

export const handleRetentionRate: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_retention_rate', args }
    );
  }
  if (!args?.date_from || !args?.date_to) {
    return deps.errorHandler.createErrorResponse(
      'date_from and date_to are required (YYYY-MM-DD)',
      'VALIDATION_ERROR', { toolName: 'affise_retention_rate', args }
    );
  }
  const offerId = Number(args?.offer_id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'offer_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_retention_rate', args }
    );
  }
  if (!args?.base_event || typeof args.base_event !== 'string') {
    return deps.errorHandler.createErrorResponse(
      'base_event is required (event name string)',
      'VALIDATION_ERROR', { toolName: 'affise_retention_rate', args }
    );
  }
  if (
    !Array.isArray(args?.events) || args.events.length === 0 ||
    !args.events.every((e: any) => typeof e === 'string' && e.length > 0)
  ) {
    return deps.errorHandler.createErrorResponse(
      'events is required and must be a non-empty array of event-name strings',
      'VALIDATION_ERROR', { toolName: 'affise_retention_rate', args }
    );
  }

  try {
    const result = await getRetentionRate(config, {
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
      return deps.errorHandler.createErrorResponse(
        result.message, 'RETENTION_ERROR',
        { toolName: 'affise_retention_rate', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Retention rate error: ${error.message}`, 'RETENTION_ERROR',
      { toolName: 'affise_retention_rate', args }, error
    );
  }
};

export const handleTimeToAction: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING', { toolName: 'affise_time_to_action', args }
    );
  }
  if (!args?.date_from || !args?.date_to) {
    return deps.errorHandler.createErrorResponse(
      'date_from and date_to are required',
      'VALIDATION_ERROR', { toolName: 'affise_time_to_action', args }
    );
  }
  const offerId = Number(args?.offer_id);
  if (!Number.isInteger(offerId) || offerId <= 0) {
    return deps.errorHandler.createErrorResponse(
      'offer_id is required and must be a positive integer',
      'VALIDATION_ERROR', { toolName: 'affise_time_to_action', args }
    );
  }

  try {
    const result = await getTimeToAction(config, {
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
      return deps.errorHandler.createErrorResponse(
        result.message, 'TIME_TO_ACTION_ERROR',
        { toolName: 'affise_time_to_action', args }
      );
    }
    return { status: 'ok', message: result.message, data: result.data, timestamp: new Date().toISOString() };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Time-to-action error: ${error.message}`, 'TIME_TO_ACTION_ERROR',
      { toolName: 'affise_time_to_action', args }, error
    );
  }
};

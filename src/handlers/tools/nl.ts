/**
 * Handlers for natural-language-driven tools + the no-auth status check.
 *
 *   affise_status         — health check, no Affise call required
 *   affise_search_offers  — NL offer search via unifiedSearchOffers
 *   affise_stats          — NL stats query via simple-parser → /stats/custom
 *   affise_smart_search   — structured offer search via unifiedSearchOffers
 */

import { createAffiseStatusTool } from '../../tools/affise_status.js';
import { searchWithNaturalLanguage, unifiedSearchOffers } from '../../tools/unified_affise_offers.js';
import { getAffiseCustomStats } from '../../tools/affise_custom_stats.js';
import { compareStats } from '../../tools/affise_stats_compare.js';
import { parseQuery, toStatsParams, extractExplicitDateRanges, findDateLikeToken } from '../../types/simple-parser.js';
import { normalizeRuToEn } from '../../types/ru-normalize.js';
import { OfferSearchResponse, StatsResponse } from '../../types/api-responses.js';
import { getDateRange } from '../../shared/date-utils.js';
import { calculateSummary, toOfferCards } from './_helpers.js';
import type { ToolHandler } from './_types.js';

export const handleStatus: ToolHandler = async (_args, config, deps) => {
  if (!config) {
    return {
      status: 'error',
      message: 'No configuration provided',
      timestamp: new Date().toISOString(),
    };
  }
  try {
    const result = await createAffiseStatusTool(config);
    return {
      status: result.status,
      message: result.message,
      data: result,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('❌ Status check error:', error.message);
    return deps.errorHandler.createErrorResponse(
      error.message, 'NETWORK_ERROR', { toolName: 'affise_status' }, error
    );
  }
};

export const handleOfferSearch: ToolHandler = async (args, config, deps): Promise<OfferSearchResponse> => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING',
      { toolName: 'affise_search_offers', args }
    );
  }
  const query = String(args?.query ?? '');
  const validation = deps.validator.validateOfferSearch({ query });
  if (!validation.isValid) {
    return deps.errorHandler.createErrorResponse(
      validation.errors.join(', '), 'VALIDATION_ERROR',
      { toolName: 'affise_search_offers', args: { query } }
    );
  }

  try {
    const result = await searchWithNaturalLanguage(config, query, {
      userIntent: 'explore',
      maxSampleSize: 50,
    });

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'SEARCH_ERROR',
        { toolName: 'affise_search_offers', args: { query } }
      );
    }

    return {
      status: 'ok',
      message: result.message || `Found ${result.itemsRetrieved || 0} offers`,
      // Slim each offer to card fields — the full /3.0/offers entries are
      // ~250 KB/30 and overflow the host's inline budget (offers-list widget
      // then renders empty). See toOfferCards.
      offers: toOfferCards(result.data),
      total_found: result.totalItems || 0,
      has_more_results: result.canContinue || false,
      query_parsed: result.query_parsed,
      search_type: result.search_type,
      insights: result.insights,
      recommendations: result.recommendations,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Search error: ${error.message}`, 'SEARCH_ERROR',
      { toolName: 'affise_search_offers', args: { query } }, error
    );
  }
};

export const handleStatsNL: ToolHandler = async (args, config, deps): Promise<StatsResponse> => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING',
      { toolName: 'affise_stats', args }
    );
  }
  const query = String(args?.query ?? '');
  const validation = deps.validator.validateStatsQuery({ query });
  if (!validation.isValid) {
    return deps.errorHandler.createErrorResponse(
      validation.errors.join(', '), 'VALIDATION_ERROR',
      { toolName: 'affise_stats', args: { query } }
    );
  }

  try {
    // Russian queries are normalized to canonical English BEFORE the (English-only)
    // parser runs. English input passes through untouched. See ru-normalize.ts.
    const nlQuery = normalizeRuToEn(query);
    const parsed = parseQuery(nlQuery);
    const statsParams = toStatsParams(parsed);

    // Multiple explicit date ranges ("from A to B and from C to D") → one pull
    // per range with the SAME slice/fields/filters. The NL parser only tracks a
    // single range, so without this a two-week ask silently used just the first.
    // Capped at MAX_RANGES pulls to bound cost; extras are dropped with a note.
    const MAX_RANGES = 6;
    const ranges = extractExplicitDateRanges(nlQuery);
    if (ranges.length >= 2) {
      const used = ranges.slice(0, MAX_RANGES);
      const periods: any[] = [];
      for (const r of used) {
        const p: any = { ...statsParams, date_from: r.date_from, date_to: r.date_to };
        delete p.period;
        const res = await getAffiseCustomStats(config, p);
        if (res.status === 'error') {
          return deps.errorHandler.createErrorResponse(
            `Range ${r.date_from}..${r.date_to}: ${res.message}`,
            'STATS_ERROR', { toolName: 'affise_stats', args: { query } }
          );
        }
        periods.push({
          date_from: r.date_from,
          date_to: r.date_to,
          data: res.data,
          summary: res.data?.stats ? calculateSummary(res.data.stats) : undefined,
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
        timestamp: new Date().toISOString(),
      };
    }

    // Period-over-period intent ("this month vs last", "WoW", "compared to …")
    // routes to the compare tool, which runs two aligned pulls and returns deltas.
    if (parsed.compare) {
      const FILTER_KEYS = [
        'partner', 'affiliate', 'supplier', 'advertiser', 'manager',
        'advertiser_manager_id', 'affiliate_manager_id', 'offer', 'smart_id',
        'country', 'city', 'currency', 'os', 'device', 'goal', 'payment_status',
        'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
      ];
      const filter: Record<string, any> = {};
      for (const k of FILTER_KEYS) {
        if ((statsParams as any)[k] !== undefined) filter[k] = (statsParams as any)[k];
      }
      const cmpParams: any = { fields: statsParams.fields, filter };
      if (parsed.date_from && parsed.date_to) {
        cmpParams.date_from = parsed.date_from;
        cmpParams.date_to = parsed.date_to;
      } else {
        cmpParams.period = parsed.time_period ?? 'thismonth';
      }

      const cmp = await compareStats(config, cmpParams);
      if (cmp.status === 'error') {
        return deps.errorHandler.createErrorResponse(
          cmp.message, 'STATS_ERROR', { toolName: 'affise_stats', args: { query } }
        );
      }
      return {
        status: 'ok',
        message: cmp.message,
        data: cmp.data as any,
        timestamp: new Date().toISOString(),
      };
    }

    if (parsed.date_from && parsed.date_to) {
      statsParams.date_from = parsed.date_from;
      statsParams.date_to   = parsed.date_to;
    } else if (parsed.time_period) {
      const dateRange = getDateRange(parsed.time_period as any);
      statsParams.date_from = dateRange.from;
      statsParams.date_to   = dateRange.to;
    } else {
      // No silent `last7days` default: an unresolved period used to return a
      // plausible-looking week of whole-account data for a query that asked
      // for something else entirely.
      const token = findDateLikeToken(nlQuery);
      return deps.errorHandler.createErrorResponse(
        token
          ? `Could not parse the date "${token}". Use YYYY-MM-DD or DD.MM.YYYY for a single day, "from <date> to <date>" for a range, or a named period (today, yesterday, last 7 days, this month).`
          : 'No date or period found in the query. Add a date (YYYY-MM-DD or DD.MM.YYYY), a range ("from <date> to <date>"), or a named period (today, yesterday, last 7 days, last 30 days, this month, last month).',
        'VALIDATION_ERROR',
        { toolName: 'affise_stats', args: { query } },
      );
    }

    const result = await getAffiseCustomStats(config, statsParams);

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'STATS_ERROR',
        { toolName: 'affise_stats', args: { query } }
      );
    }

    return {
      status: 'ok',
      message: 'Stats retrieved successfully',
      data: result.data,
      metadata: (result as any).metadata,
      summary: result.data?.stats ? calculateSummary(result.data.stats) : undefined,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Stats error: ${error.message}`, 'STATS_ERROR',
      { toolName: 'affise_stats', args: { query } }, error
    );
  }
};

export const handleSmartSearch: ToolHandler = async (args, config, deps) => {
  if (!config || !config.baseUrl || !config.apiKey) {
    return deps.errorHandler.createErrorResponse(
      'Configuration not loaded - baseUrl or apiKey missing',
      'CONFIG_MISSING',
      { toolName: 'affise_smart_search', args }
    );
  }

  const validation = deps.validator.validateSmartSearch(args);
  if (!validation.isValid) {
    return deps.errorHandler.createErrorResponse(
      validation.errors.join(', '), 'VALIDATION_ERROR',
      { toolName: 'affise_smart_search', args }
    );
  }

  try {
    const searchParams: any = { query: args.query };
    if (args.categories || args.countries) {
      searchParams.structured = {};
      if (Array.isArray(args.categories)) searchParams.structured.categories = args.categories;
      if (Array.isArray(args.countries))  searchParams.structured.countries  = args.countries;
    }
    searchParams.options = {
      userIntent:    'analyze',
      maxSampleSize: 100,
      autoComplete:  false,
    };

    const result = await unifiedSearchOffers(config, searchParams);

    if (result.status === 'error') {
      return deps.errorHandler.createErrorResponse(
        result.message, 'SEARCH_ERROR',
        { toolName: 'affise_smart_search', args }
      );
    }

    return {
      status: 'ok',
      message: result.message || 'Smart search completed successfully',
      data: {
        // Slim to card fields (smart_search pulls up to 100 offers — the raw
        // payload is megabytes and overflows the inline budget). See toOfferCards.
        offers:        toOfferCards(result.data),
        total_found:   result.totalItems || 0,
        search_type:   result.search_type,
        query_parsed:  result.query_parsed,
        insights:      result.insights,
        recommendations: result.recommendations,
        can_continue:  result.canContinue || false,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    return deps.errorHandler.createErrorResponse(
      `Smart search error: ${error.message}`, 'SEARCH_ERROR',
      { toolName: 'affise_smart_search', args }, error
    );
  }
};

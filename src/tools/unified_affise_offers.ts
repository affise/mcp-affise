/**
 * Unified Affise Offers Search Tool
 *
 * Combines basic parameter search with NLP capabilities. Provides a
 * unified interface for both structured and natural-language queries.
 *
 * As of WAVE 4 refactor (2026-05) the original 1433-LOC kitchen-sink
 * file is split across four siblings:
 *
 *   unified_affise_offers.types.ts     interfaces (UnifiedSearchParams,
 *                                       OfferSummary, ParsedQuery, ...)
 *   unified_affise_offers.api.ts       HTTP layer + offer-shape helpers
 *   unified_affise_offers.nlp.ts       parseQuery + buildSmartSearchParams
 *                                       + category resolution
 *   unified_affise_offers.analysis.ts  insights, recommendations, error
 *
 * This file keeps the search core (the orchestrator), the convenience
 * wrappers, the backward-compatibility shims, and the MCP tool export
 * config. All re-exports of public types/functions are preserved so
 * downstream imports (handlers/tools/nl.ts, smart_pagination.ts,
 * prompts/auto_analysis.ts) keep working unchanged.
 */

import { AffiseOffersPagination } from './smart_pagination.js';
import type { AffiseOffer } from '../types/api-responses.js';

import {
  parseQuery,
  buildSmartSearchParams,
} from './unified_affise_offers.nlp.js';
import {
  createOfferSummary,
  searchAffiseOffersLegacy,
} from './unified_affise_offers.api.js';
import {
  analyzeOffersIntelligent,
  enhanceMessageWithContext,
  generateUnifiedRecommendations,
  createErrorResult,
} from './unified_affise_offers.analysis.js';

// Re-export types for callers that imported from this file pre-refactor.
export type {
  UnifiedSearchParams,
  SearchProgress,
  OfferSummary,
  ParsedQuery,
  UnifiedSearchResult,
  LegacySearchResult,
} from './unified_affise_offers.types.js';

import type {
  UnifiedSearchParams,
  SearchProgress,
  ParsedQuery,
  UnifiedSearchResult,
  LegacySearchResult,
} from './unified_affise_offers.types.js';

// ============================================================================
// MAIN UNIFIED SEARCH FUNCTION
// ============================================================================

/**
 * Unified search function that handles both NLP queries and structured parameters
 *
 * EXAMPLES:
 * // Natural language
 * await unifiedSearchOffers(config, {
 *   query: "Find gaming offers for US mobile traffic"
 * });
 *
 * // Structured parameters
 * await unifiedSearchOffers(config, {
 *   structured: { countries: ['US'], categories: ['gaming'], os: ['iOS', 'Android'] }
 * });
 *
 * // Hybrid approach
 * await unifiedSearchOffers(config, {
 *   query: "high converting offers",
 *   structured: { countries: ['US'], status: ['active'] }
 * });
 *
 * // Legacy single-page mode
 * await unifiedSearchOffers(config, {
 *   structured: { countries: ['US'] },
 *   options: { page: 1, limit: 50 }
 * });
 */
export async function unifiedSearchOffers(
  config: { baseUrl: string; apiKey: string },
  params: UnifiedSearchParams
): Promise<UnifiedSearchResult> {
  const {
    query,
    structured,
    options = {}
  } = params;

  const {
    userIntent = 'explore',
    autoComplete = false,
    maxSampleSize = 50,
    page,
    limit,
    onProgress
  } = options;

  try {
    // Validate input
    if (!query && !structured) {
      throw new Error('Either query or structured parameters must be provided');
    }

    let searchParams: Record<string, unknown> = {};
    let searchType: 'natural_language' | 'structured' | 'hybrid' = 'structured';
    let parsedQuery: ParsedQuery | undefined;

    // Determine search type and build parameters
    if (query && structured) {
      searchType = 'hybrid';
      // Parse NLP query first
      parsedQuery = await parseQuery(query);
      // Build NLP parameters
      const nlpParams = await buildSmartSearchParams(config, parsedQuery);
      // Merge with structured parameters (structured takes precedence)
      searchParams = { ...nlpParams, ...structured };
    } else if (query) {
      searchType = 'natural_language';
      // Parse and build from NLP
      parsedQuery = await parseQuery(query);
      searchParams = await buildSmartSearchParams(config, parsedQuery);
    } else if (structured) {
      searchType = 'structured';
      // Use structured parameters directly
      searchParams = { ...structured };
    }

    // Add default status filter if not specified
    if (!searchParams.status) {
      searchParams.status = ['active'];
    }

    // Handle legacy single-page requests
    if (page !== undefined || limit !== undefined) {
      const legacyParams = {
        ...searchParams,
        page: page ?? 1,
        limit: limit ?? 100
      };

      const legacyResult = await searchAffiseOffersLegacy(config, legacyParams);

      if (legacyResult.status === 'error') {
        return createErrorResult(legacyResult.message, searchType);
      }

      const offers = (legacyResult.data?.offers || []).map((offer: AffiseOffer) => createOfferSummary(offer));
      const insights = analyzeOffersIntelligent(offers);

      return {
        status: 'complete',
        message: enhanceMessageWithContext(legacyResult.message, parsedQuery, offers.length, searchType),
        data: offers,
        totalItems: legacyResult.pagination?.total || offers.length,
        totalPages: legacyResult.pagination?.pages || 1,
        itemsRetrieved: offers.length,
        pagesProcessed: 1,
        executionTime: 0,
        requestCount: 1,
        averageRequestTime: 0,
        recommendations: generateUnifiedRecommendations(parsedQuery, offers, searchType, insights),
        canContinue: false,
        errors: [],
        warnings: [],
        timestamp: new Date().toISOString(),
        query_parsed: parsedQuery,
        search_type: searchType,
        insights
      };
    }

    // Use smart pagination for most cases
    const pagination = new AffiseOffersPagination({
      initialSampleSize: Math.min(maxSampleSize, userIntent === 'explore' ? 30 : 50),
      largeDatasetThreshold: userIntent === 'export' ? 1000 : 200,
      maxPageSize: 100,
      requestDelay: 150,
      askUserConfirmation: !autoComplete
    });

    // Enhanced progress callback
    const enhancedProgress = onProgress ? (progress: any) => {
      const timeRemaining = progress.estimatedTimeRemaining > 60000
        ? `${Math.round(progress.estimatedTimeRemaining / 60000)}m`
        : `${Math.round(progress.estimatedTimeRemaining / 1000)}s`;

      const context = searchType === 'natural_language' && parsedQuery?.verticals.length
        ? ` (${parsedQuery.verticals.join(', ')} offers)`
        : '';

      onProgress({
        ...progress,
        message: `Searching page ${progress.page}/${progress.totalPages}${context} • ${progress.itemsRetrieved} offers found • ${timeRemaining} remaining`
      });
    } : undefined;

    // Execute smart search
    const result = await pagination.searchOffers(config, searchParams, {
      userIntent,
      onProgress: enhancedProgress
    });

    // Process and enhance results
    if (result.status === 'sample' || result.status === 'complete' || result.status === 'user_confirmation_required') {
      const processedOffers = (result.data as AffiseOffer[]).map((offer: AffiseOffer) => createOfferSummary(offer));
      const insights = analyzeOffersIntelligent(processedOffers);

      const enhancedResult: UnifiedSearchResult = {
        ...result,
        data: processedOffers,
        message: enhanceMessageWithContext(result.message, parsedQuery, processedOffers.length, searchType),
        recommendations: [
          ...result.recommendations,
          ...generateUnifiedRecommendations(parsedQuery, processedOffers, searchType, insights)
        ],
        query_parsed: parsedQuery,
        search_type: searchType,
        insights
      };

      return enhancedResult;
    }

    return {
      ...result,
      query_parsed: parsedQuery,
      search_type: searchType,
      insights: {
        summary: { total: 0, active: 0, topOffers: 0, withCreatives: 0, withLandings: 0 },
        insights: [],
        recommendations: [],
        categories: [],
        countries: [],
        advertisers: []
      }
    } as UnifiedSearchResult;

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return createErrorResult(`Unified search error: ${errorMessage}`, 'structured');
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Natural language search (simplified interface)
 */
export async function searchWithNaturalLanguage(
  config: { baseUrl: string; apiKey: string },
  query: string,
  options?: UnifiedSearchParams['options']
): Promise<UnifiedSearchResult> {
  return unifiedSearchOffers(config, { query, options });
}

/**
 * Structured parameter search (simplified interface)
 */
export async function searchWithStructuredParams(
  config: { baseUrl: string; apiKey: string },
  params: NonNullable<UnifiedSearchParams['structured']>,
  options?: UnifiedSearchParams['options']
): Promise<UnifiedSearchResult> {
  return unifiedSearchOffers(config, { structured: params, options });
}

/**
 * Quick preset searches with enhanced categories
 */
export async function quickSearch(
  config: { baseUrl: string; apiKey: string },
  preset: 'trending' | 'high-converting' | 'mobile-optimized' | 'new-offers' | 'top-payouts' | 'crypto' | 'dating' | 'finance',
  additionalQuery?: string,
  options?: UnifiedSearchParams['options']
): Promise<UnifiedSearchResult> {
  const presetQueries = {
    'trending': 'popular trending offers with high conversion rates and good traffic volume',
    'high-converting': 'best performing offers with highest conversion rates and proven results',
    'mobile-optimized': 'mobile app offers optimized for iOS and Android traffic with responsive landing pages',
    'new-offers': 'recently added new offers launched this month with fresh creative materials',
    'top-payouts': 'highest paying offers with best revenue rates and competitive commission structures',
    'crypto': 'cryptocurrency trading and investment offers with bitcoin forex and blockchain focus',
    'dating': 'dating and relationship offers including romance social chat and adult dating platforms',
    'finance': 'financial services including trading forex loans credit cards insurance and investment platforms'
  };

  const query = additionalQuery
    ? `${presetQueries[preset]} ${additionalQuery}`
    : presetQueries[preset];

  return searchWithNaturalLanguage(config, query, {
    userIntent: 'explore',
    autoComplete: false,
    maxSampleSize: 40,
    ...options
  });
}

/**
 * Continue search from continuation token
 */
export async function continueUnifiedSearch(
  continuationToken: string,
  onProgress?: (progress: SearchProgress) => void
): Promise<UnifiedSearchResult> {
  try {
    const pagination = new AffiseOffersPagination();
    const wrappedProgress = onProgress ? (progress: any) => {
      onProgress({
        page: progress.page,
        totalPages: progress.totalPages,
        itemsRetrieved: progress.itemsRetrieved,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
        message: `Processing page ${progress.page} of ${progress.totalPages}`
      });
    } : undefined;

    const result = await pagination.engine.continueFromToken(continuationToken, { onProgress: wrappedProgress });

    if (result.status === 'complete' || result.status === 'sample') {
      const processedOffers = (result.data as AffiseOffer[]).map((offer: AffiseOffer) => createOfferSummary(offer));
      const insights = analyzeOffersIntelligent(processedOffers);

      return {
        ...result,
        data: processedOffers,
        search_type: 'structured', // Default for continuation
        insights
      } as UnifiedSearchResult;
    }

    return {
      ...result,
      search_type: 'structured',
      insights: {
        summary: { total: 0, active: 0, topOffers: 0, withCreatives: 0, withLandings: 0 },
        insights: [],
        recommendations: [],
        categories: [],
        countries: [],
        advertisers: []
      }
    } as UnifiedSearchResult;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return createErrorResult(`Continuation error: ${errorMessage}`, 'structured');
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY WRAPPERS
// ============================================================================

/**
 * Backward compatibility wrapper for searchOffersImproved
 */
export async function searchOffersImproved(
  config: { baseUrl: string; apiKey: string },
  args: { query: string; options?: any }
): Promise<any> {
  const result = await searchWithNaturalLanguage(config, args.query, args.options);

  // Convert to legacy format
  return {
    status: result.status === 'error' ? 'error' : 'ok',
    message: result.message,
    offers_summary: result.data,
    total_found: result.totalItems,
    query_parsed: result.query_parsed,
    has_more_results: result.canContinue,
    timestamp: result.timestamp
  };
}

/**
 * Backward compatibility wrapper for smartSearchAffiseOffers
 */
export async function smartSearchAffiseOffers(
  config: { baseUrl: string; apiKey: string },
  params: any,
  options?: any
): Promise<UnifiedSearchResult> {
  return searchWithStructuredParams(config, params, options);
}

// ============================================================================
// EXPORT CONFIGURATIONS FOR MCP TOOLS
// ============================================================================

export const unifiedSearchTool = {
  name: "affise_unified_search",
  description: "Unified Affise offers search supporting both natural language and structured parameters with intelligent pagination",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural language search query (e.g., "Find gaming offers for US mobile traffic", "high converting finance offers")'
      },
      structured: {
        type: 'object',
        description: 'Structured search parameters for direct API control',
        properties: {
          countries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Country codes (US, UK, CA, etc.)'
          },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category IDs'
          },
          os: {
            type: 'array',
            items: { type: 'string' },
            description: 'Operating systems (iOS, Android, Windows, etc.)'
          },
          status: {
            type: 'array',
            items: { type: 'string' },
            description: 'Offer status (active, stopped, suspended)'
          },
          advertiser: {
            type: 'array',
            items: { type: 'string' },
            description: 'Advertiser IDs'
          },
          is_top: {
            type: 'number',
            description: 'Filter for top offers (1 for top offers only)'
          }
        }
      },
      options: {
        type: 'object',
        description: 'Search options and preferences',
        properties: {
          userIntent: {
            type: 'string',
            enum: ['explore', 'analyze', 'export'],
            description: 'User intent: explore (quick preview), analyze (detailed analysis), export (all data)'
          },
          autoComplete: {
            type: 'boolean',
            description: 'Skip user confirmation for large datasets'
          },
          maxSampleSize: {
            type: 'number',
            description: 'Maximum sample size for initial preview (default: 50)'
          },
          page: {
            type: 'number',
            description: 'Specific page number (legacy single-page mode)'
          },
          limit: {
            type: 'number',
            description: 'Results per page (legacy single-page mode, max: 500)'
          }
        }
      }
    },
    additionalProperties: false
  }
};

/**
 * Legacy searchAffiseOffers function for backward compatibility
 */
export async function searchAffiseOffers(
  config: { baseUrl: string; apiKey: string },
  params: any
): Promise<LegacySearchResult> {
  return searchAffiseOffersLegacy(config, params);
}

// Default export with all main functions
export default {
  unifiedSearchOffers,
  searchWithNaturalLanguage,
  searchWithStructuredParams,
  quickSearch,
  continueUnifiedSearch,
  // Backward compatibility
  searchAffiseOffers,
  searchOffersImproved,
  smartSearchAffiseOffers
};

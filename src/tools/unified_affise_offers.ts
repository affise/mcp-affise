/**
 * Unified Affise Offers Search Tool
 * Combines basic parameter search with NLP capabilities
 * Provides unified interface for both structured and natural language queries
 * 
 * @version 1.0.0
 * @author Combined from affise_offers.ts and affise_search_offers.ts
 */

import axios from 'axios';
import { AffiseOffersPagination, SmartPaginationResult } from './smart_pagination.js';
import { AffiseOffer, AffisePayment, AffiseLanding } from '../types/api-responses.js';

// ============================================================================
// UNIFIED TYPES AND INTERFACES
// ============================================================================

export interface UnifiedSearchParams {
  // Option 1: Natural language query
  query?: string;
  
  // Option 2: Structured parameters (original functionality)
  structured?: {
    q?: string;                    // Direct search query
    int_id?: string[];            // Internal IDs
    countries?: string[];         // Country codes
    os?: string[];               // Operating systems
    categories?: string[];       // Categories
    sort?: { [key: string]: 'asc' | 'desc' }; // Sort options
    status?: string[];           // Offer status
    advertiser?: string[];       // Advertiser IDs
    privacy?: number[];          // Privacy settings
    updated_at?: string;         // Updated after date
    is_top?: number;            // Is top offer
    bundle_id?: string;         // Bundle ID
    caps_type?: string;         // Caps type
    caps_country?: string;      // Caps country
    smartlink_categories?: string[]; // Smartlink categories
    advertiser_manager_id?: string[]; // Advertiser manager IDs
    external_offer_id?: string; // External offer ID
    additional_fields?: string; // Additional fields
  };
  
  // Search options
  options?: {
    userIntent?: 'explore' | 'analyze' | 'export';
    autoComplete?: boolean;
    maxSampleSize?: number;
    page?: number;              // For legacy single-page requests
    limit?: number;             // For legacy single-page requests
    onProgress?: (progress: SearchProgress) => void;
  };
}

export interface SearchProgress {
  page: number;
  totalPages: number;
  itemsRetrieved: number;
  estimatedTimeRemaining: number;
  message: string;
}

export interface OfferSummary {
  id: number;
  title: string;
  advertiser: string;
  url: string;
  countries: string[];
  categories: string[];
  os_targeting: string[];
  is_top: boolean;
  revenue: number;
  currency: string;
  required_approval: boolean;
  payments: AffisePayment[];
  partner_payments: AffisePayment[];
  landings: AffiseLanding[];
  cr: number;
  epc: number;
  status: string;
}

export interface ParsedQuery {
  originalQuery: string;
  keywords: string[];
  countries: string[];
  categories: string[];
  os: string[];
  verticals: string[];
  filters: {
    isTop?: boolean;
    isActive?: boolean;
    requiresApproval?: boolean;
  };
}

export interface UnifiedSearchResult extends SmartPaginationResult<OfferSummary> {
  query_parsed?: ParsedQuery;
  search_type: 'natural_language' | 'structured' | 'hybrid';
  insights?: {
    summary: {
      total: number;
      active: number;
      topOffers: number;
      withCreatives: number;
      withLandings: number;
    };
    insights: string[];
    recommendations: string[];
    categories: { name: string; count: number }[];
    countries: { name: string; count: number }[];
    advertisers: { name: string; count: number }[];
  };
}

export interface LegacySearchResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  timestamp: string;
}

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
// NATURAL LANGUAGE PROCESSING FUNCTIONS
// ============================================================================

/**
 * Parse natural language queries into structured search parameters
 */
async function parseQuery(query: string): Promise<ParsedQuery> {
  const intent: ParsedQuery = {
    originalQuery: query,
    keywords: query.toLowerCase().split(/\s+/),
    countries: [],
    categories: [],
    os: [],
    verticals: [],
    filters: {}
  };

  const queryLower = query.toLowerCase();

  // Extract countries with comprehensive mapping
  const countryMap: Record<string, string[]> = {
    'US': ['us', 'usa', 'united states', 'america', 'american'],
    'UK': ['uk', 'britain', 'gb', 'england', 'british', 'united kingdom'],
    'CA': ['canada', 'canadian'],
    'AU': ['australia', 'australian', 'aussie', 'oz'],
    'DE': ['germany', 'german', 'deutschland'],
    'FR': ['france', 'french', 'française'],
    'IT': ['italy', 'italian', 'italia'],
    'ES': ['spain', 'spanish', 'españa'],
    'IN': ['india', 'indian'],
    'JP': ['japan', 'japanese'],
    'BR': ['brazil', 'brazilian', 'brasil'],
    'MX': ['mexico', 'mexican'],
    'NL': ['netherlands', 'dutch', 'holland'],
    'SE': ['sweden', 'swedish'],
    'NO': ['norway', 'norwegian'],
    'DK': ['denmark', 'danish'],
    'FI': ['finland', 'finnish'],
    'PL': ['poland', 'polish'],
    'RU': ['russia', 'russian'],
    'CN': ['china', 'chinese'],
    'KR': ['korea', 'korean', 'south korea'],
    'ZA': ['south africa', 'south african'],
    'NG': ['nigeria', 'nigerian'],
    'EG': ['egypt', 'egyptian'],
    'TR': ['turkey', 'turkish'],
    'GR': ['greece', 'greek'],
    'PT': ['portugal', 'portuguese'],
    'CH': ['switzerland', 'swiss'],
    'AT': ['austria', 'austrian'],
    'BE': ['belgium', 'belgian']
  };

  for (const [code, patterns] of Object.entries(countryMap)) {
    if (patterns.some(pattern => queryLower.includes(pattern))) {
      intent.countries.push(code);
    }
  }

  // Extract operating systems and devices
  if (queryLower.includes('mobile')) {
    intent.os.push('iOS', 'Android');
  }
  if (queryLower.includes('ios') || queryLower.includes('iphone') || queryLower.includes('ipad') || queryLower.includes('apple')) {
    intent.os.push('iOS');
  }
  if (queryLower.includes('android')) {
    intent.os.push('Android');
  }
  if (queryLower.includes('windows') || queryLower.includes('desktop') || queryLower.includes('pc')) {
    intent.os.push('Windows');
  }
  if (queryLower.includes('mac') || queryLower.includes('macos') || queryLower.includes('macbook')) {
    intent.os.push('macOS');
  }

  // Extract verticals with comprehensive patterns
  const verticalMap: Record<string, string[]> = {
    'gaming': [
      'gaming', 'game', 'games', 'casino', 'poker', 'rpg', 'slots', 'slot',
      'gambling', 'betting', 'roulette', 'blackjack', 'bingo', 'lottery',
      'esports', 'mobile games', 'social casino', 'skill games', 'arcade'
    ],
    'dating': [
      'dating', 'love', 'match', 'romance', 'relationship', 'singles',
      'hookup', 'social', 'chat', 'adult dating', 'mature dating', 'tinder',
      'bumble', 'personals', 'meetup'
    ],
    'finance': [
      'finance', 'trading', 'forex', 'crypto', 'bitcoin', 'investment',
      'loan', 'loans', 'credit', 'insurance', 'banking', 'binary options',
      'stocks', 'etf', 'retirement', 'mortgage', 'personal loan', 'financial',
      'cryptocurrency', 'blockchain', 'ethereum', 'money', 'cash', 'wealth'
    ],
    'ecommerce': [
      'shopping', 'ecommerce', 'store', 'retail', 'marketplace',
      'fashion', 'electronics', 'beauty', 'home', 'garden', 'amazon',
      'ebay', 'product', 'buy', 'sell', 'online store'
    ],
    'entertainment': [
      'entertainment', 'video', 'music', 'streaming', 'movies',
      'tv shows', 'podcast', 'news', 'sports', 'netflix', 'youtube',
      'media', 'content'
    ],
    'food': [
      'food', 'restaurant', 'delivery', 'meal', 'grocery',
      'cooking', 'recipe', 'diet', 'nutrition', 'foodie', 'dining'
    ],
    'health': [
      'health', 'fitness', 'medical', 'wellness', 'supplement',
      'diet', 'weight loss', 'workout', 'gym', 'healthcare', 'medicine',
      'doctor', 'pharmacy', 'vitamins'
    ],
    'education': [
      'education', 'course', 'learning', 'training', 'certification',
      'online course', 'skill', 'language', 'university', 'school',
      'academy', 'tutorial'
    ],
    'travel': [
      'travel', 'hotel', 'flight', 'vacation', 'booking',
      'tourism', 'cruise', 'rental car', 'accommodation', 'trip',
      'holiday', 'destination'
    ],
    'business': [
      'business', 'software', 'saas', 'crm', 'productivity',
      'marketing', 'analytics', 'tools', 'b2b', 'enterprise'
    ],
    'adult': [
      'adult', 'xxx', 'porn', 'webcam', 'cam', 'escort'
    ]
  };

  for (const [vertical, patterns] of Object.entries(verticalMap)) {
    if (patterns.some(pattern => queryLower.includes(pattern))) {
      intent.verticals.push(vertical);
    }
  }

  // Extract quality filters
  if (queryLower.includes('top') || queryLower.includes('best') || queryLower.includes('high quality') || queryLower.includes('premium')) {
    intent.filters.isTop = true;
  }
  if (queryLower.includes('active') || queryLower.includes('live') || queryLower.includes('running')) {
    intent.filters.isActive = true;
  }
  if (queryLower.includes('no approval') || queryLower.includes('instant approval')) {
    intent.filters.requiresApproval = false;
  }

  return intent;
}

/**
 * Build search parameters from parsed query with enhanced category resolution
 */
async function buildSmartSearchParams(
  config: { baseUrl: string; apiKey: string },
  parsedQuery: ParsedQuery
): Promise<any> {
  const searchParams: any = {};

  // Add countries
  if (parsedQuery.countries.length > 0) {
    searchParams.countries = parsedQuery.countries;
  }

  // Add operating systems
  if (parsedQuery.os.length > 0) {
    searchParams.os = parsedQuery.os;
  }

  // Add quality filters
  if (parsedQuery.filters.isTop) {
    searchParams.is_top = 1;
  }
  if (parsedQuery.filters.isActive) {
    searchParams.status = ['active'];
  }

  // Resolve and add categories
  if (parsedQuery.verticals.length > 0) {
    const categoryIds: string[] = [];
    
    for (const vertical of parsedQuery.verticals) {
      try {
        let verticalCategories: string[] = [];

        if (vertical === 'gaming') {
          // Enhanced gaming category resolution with error handling
          const categoryPromises = [
            getCategoriesBySearch(config, 'game').catch(() => []),
            getCategoriesBySearch(config, 'gaming').catch(() => []),
            getCategoriesBySearch(config, 'casino').catch(() => []),
            getCategoriesBySearch(config, 'poker').catch(() => []),
            getCategoriesBySearch(config, 'slot').catch(() => [])
          ];
          
          const results = await Promise.all(categoryPromises);
          verticalCategories = results.flat();
        } else if (vertical === 'finance') {
          // Enhanced finance category resolution
          const categoryPromises = [
            getCategoriesBySearch(config, 'finance').catch(() => []),
            getCategoriesBySearch(config, 'trading').catch(() => []),
            getCategoriesBySearch(config, 'forex').catch(() => []),
            getCategoriesBySearch(config, 'crypto').catch(() => []),
            getCategoriesBySearch(config, 'bitcoin').catch(() => [])
          ];
          
          const results = await Promise.all(categoryPromises);
          verticalCategories = results.flat();
        } else if (vertical === 'dating') {
          // Dating category resolution
          const categoryPromises = [
            getCategoriesBySearch(config, 'dating').catch(() => []),
            getCategoriesBySearch(config, 'love').catch(() => []),
            getCategoriesBySearch(config, 'social').catch(() => [])
          ];
          
          const results = await Promise.all(categoryPromises);
          verticalCategories = results.flat();
        } else {
          // Standard category resolution
          verticalCategories = await getCategoriesBySearch(config, vertical).catch(() => []);
        }

        categoryIds.push(...verticalCategories);
      } catch (error) {
        console.warn(`Failed to resolve categories for ${vertical}:`, error instanceof Error ? error.message : String(error));
      }
    }

    // Add unique category IDs
    if (categoryIds.length > 0) {
      searchParams.categories = [...new Set(categoryIds)];
    } else {
      // If no categories were resolved, add the vertical terms as search query
      const verticalTerms = parsedQuery.verticals.join(' ');
      searchParams.q = verticalTerms;
      // No categories resolved, using as search terms (removed console.log to fix JSON-RPC protocol)
    }
  }

  // Add search query if no specific filters were applied
  if (!searchParams.countries && !searchParams.categories && !searchParams.os) {
    const searchTerms = parsedQuery.keywords.filter(word => 
      word.length > 2 && 
      !['find', 'search', 'show', 'get', 'offers', 'for', 'with', 'high', 'best', 'top', 'the', 'and', 'or'].includes(word)
    );
    if (searchTerms.length > 0) {
      searchParams.q = searchTerms.join(' ');
    }
  }

  return searchParams;
}

/**
 * Get categories by search term using Affise API with enhanced error handling
 */
async function getCategoriesBySearch(
  config: { baseUrl: string; apiKey: string },
  searchTerm: string
): Promise<string[]> {
  try {
    // Get all categories first
    const response = await makeAffiseRequest(
      config, 
      `/3.0/offer/categories?limit=1000&order=title&orderType=asc`
    );
    
    const allCategories = response.categories || [];
    
    // Filter categories by search term manually
    const matchingCategories = allCategories.filter((cat: any) => {
      const title = cat.title?.toLowerCase() || '';
      const searchLower = searchTerm.toLowerCase();
      
      // Check for exact match or contains match
      return title.includes(searchLower) || 
             searchLower.includes(title) ||
             isRelatedCategory(title, searchLower);
    });
    
    // Found categories matching the search term (removed console.log to fix JSON-RPC protocol)
    
    return matchingCategories.map((cat: any) => cat.id?.toString()).filter(Boolean);
    
  } catch (error) {
    console.warn(`Categories endpoint failed for "${searchTerm}", using predefined categories:`, error instanceof Error ? error.message : String(error));
    
    // Fallback to predefined category mappings
    return getPredefinedCategories(searchTerm);
  }
}

/**
 * Check if two category terms are related (enhanced with more relationships)
 */
function isRelatedCategory(categoryTitle: string, searchTerm: string): boolean {
  const relationMap: Record<string, string[]> = {
    'game': ['gaming', 'casino', 'poker', 'slot', 'gambling', 'betting', 'arcade'],
    'gaming': ['game', 'casino', 'poker', 'slot', 'gambling', 'betting', 'esports'],
    'casino': ['game', 'gaming', 'poker', 'slot', 'gambling', 'betting', 'roulette', 'blackjack', 'bingo'],
    'poker': ['game', 'gaming', 'casino', 'gambling', 'betting', 'cards'],
    'finance': ['trading', 'forex', 'crypto', 'bitcoin', 'investment', 'loan', 'credit', 'money', 'wealth'],
    'trading': ['finance', 'forex', 'crypto', 'bitcoin', 'investment', 'binary', 'stocks'],
    'forex': ['finance', 'trading', 'crypto', 'investment', 'currency', 'money'],
    'crypto': ['finance', 'trading', 'bitcoin', 'investment', 'blockchain', 'ethereum'],
    'dating': ['romance', 'relationship', 'social', 'chat', 'adult', 'love', 'match'],
    'health': ['fitness', 'wellness', 'medical', 'diet', 'supplement', 'medicine'],
    'ecommerce': ['shopping', 'retail', 'store', 'marketplace', 'fashion', 'buy', 'sell'],
    'education': ['learning', 'course', 'training', 'academic', 'skill', 'university'],
    'travel': ['hotel', 'flight', 'vacation', 'booking', 'tourism', 'trip'],
    'entertainment': ['video', 'music', 'streaming', 'movies', 'media', 'content']
  };
  
  const related = relationMap[searchTerm] || [];
  return related.some(term => categoryTitle.includes(term));
}

/**
 * Enhanced predefined category mappings
 */
function getPredefinedCategories(searchTerm: string): string[] {
  const predefinedMappings: Record<string, string[]> = {
    'game': ['1', '2', '3', '4'],
    'gaming': ['1', '2', '3', '4'],
    'casino': ['4', '5', '6'],
    'poker': ['6', '7'],
    'finance': ['10', '11', '12'],
    'trading': ['12', '13', '14'],
    'forex': ['14', '15'],
    'crypto': ['15', '16', '17'],
    'bitcoin': ['16', '17'],
    'dating': ['20', '21', '22'],
    'health': ['30', '31'],
    'fitness': ['31', '32'],
    'ecommerce': ['40', '41', '42'],
    'education': ['50', '51'],
    'travel': ['60', '61'],
    'entertainment': ['70', '71']
  };
  
  const normalizedTerm = searchTerm.toLowerCase();
  return predefinedMappings[normalizedTerm] || [];
}

// ============================================================================
// API AND DATA PROCESSING FUNCTIONS
// ============================================================================

/**
 * Make authenticated requests to Affise API with enhanced error handling
 */
async function makeAffiseRequest(
  config: { baseUrl: string; apiKey: string },
  endpoint: string
): Promise<any> {
  const url = `${config.baseUrl}${endpoint}`;
  
  try {
    const response = await axios.get(url, {
      headers: {
        'api-key': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (response.status >= 400) {
      throw new Error(`Affise API error: ${response.status} ${response.statusText}`);
    }

    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Unable to connect to Affise server');
      } else if (error.code === 'ETIMEDOUT') {
        throw new Error('Request timeout exceeded');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Affise server not found (DNS error)');
      }
    }
    
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any;
      throw new Error(`API error: ${axiosError.response?.status} - ${axiosError.response?.data?.message || axiosError.response?.statusText}`);
    }
    
    if (error instanceof Error) {
      throw new Error(`Request failed: ${error.message}`);
    }
    
    throw new Error('Request failed: Unknown error');
  }
}

/**
 * Legacy search function for backward compatibility
 */
async function searchAffiseOffersLegacy(
  config: { baseUrl: string; apiKey: string },
  params: any
): Promise<LegacySearchResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: new Date().toISOString()
    };
  }

  try {
    const url = `${baseUrl}/3.0/offers`;
    const queryParams = new URLSearchParams();
    
    // Build query parameters
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(item => queryParams.append(`${key}[]`, item.toString()));
      } else if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    const response = await axios.get(`${url}?${queryParams.toString()}`, {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (response.status >= 400) {
      return {
        status: 'error',
        message: `API returned error: ${response.status} ${response.statusText}`,
        timestamp: new Date().toISOString()
      };
    }

    return {
      status: 'ok',
      message: `Found ${response.data.offers?.length || 0} offers`,
      data: response.data,
      pagination: response.data.pagination,
      timestamp: new Date().toISOString()
    };

  } catch (error: unknown) {
    let errorMessage = 'Unknown error';

    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Unable to connect to Affise server';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Request timeout exceeded';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'Affise server not found (DNS error)';
      }
    }
    
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any;
      errorMessage = axiosError.response?.data?.message || axiosError.message || 'Request failed';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      status: 'error',
      message: `Error searching offers: ${errorMessage}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Create standardized offer summary from raw offer data
 */
function createOfferSummary(offer: any): OfferSummary {
  return {
    id: offer.id,
    title: offer.title || 'Untitled Offer',
    advertiser: offer.advertiser || 'Unknown Advertiser',
    url: offer.url || '',
    countries: offer.countries || [],
    categories: offer.full_categories?.map((cat: any) => cat.title).filter(Boolean) || [],
    os_targeting: extractOSTargeting(offer),
    is_top: offer.is_top === 1,
    revenue: getHighestRevenue(offer),
    currency: offer.currency || 'USD',
    required_approval: offer.required_approval || false,
    payments: offer.payments || [],
    partner_payments: offer.partner_payments || [],
    landings: offer.landings || [],
    cr: parseFloat(offer.cr) || 0,
    epc: parseFloat(offer.epc) || 0,
    status: offer.status || 'unknown'
  };
}

/**
 * Extract OS targeting from offer with comprehensive detection
 */
function extractOSTargeting(offer: any): string[] {
  const osTargeting: string[] = [];
  
  // Check strictly_os field
  if (offer.strictly_os?.items) {
    Object.keys(offer.strictly_os.items).forEach(os => {
      if (!osTargeting.includes(os)) {
        osTargeting.push(os);
      }
    });
  }
  
  // Check targeting rules
  if (offer.targeting) {
    offer.targeting.forEach((rule: any) => {
      if (rule.os?.allow) {
        rule.os.allow.forEach((osRule: any) => {
          if (osRule.name && !osTargeting.includes(osRule.name)) {
            osTargeting.push(osRule.name);
          }
        });
      }
    });
  }
  
  // Check caps for OS information
  if (offer.caps) {
    offer.caps.forEach((cap: any) => {
      if (cap.os && !osTargeting.includes(cap.os)) {
        osTargeting.push(cap.os);
      }
    });
  }
  
  return osTargeting;
}

/**
 * Get highest revenue from payments with enhanced logic
 */
function getHighestRevenue(offer: any): number {
  let maxRevenue = 0;
  
  // Check partner payments first (most relevant for partners)
  if (offer.partner_payments && Array.isArray(offer.partner_payments)) {
    offer.partner_payments.forEach((payment: any) => {
      const revenue = parseFloat(payment.revenue) || 0;
      if (revenue > maxRevenue) {
        maxRevenue = revenue;
      }
    });
  }
  
  // Fallback to regular payments
  if (maxRevenue === 0 && offer.payments && Array.isArray(offer.payments)) {
    offer.payments.forEach((payment: any) => {
      const revenue = parseFloat(payment.revenue) || 0;
      if (revenue > maxRevenue) {
        maxRevenue = revenue;
      }
    });
  }
  
  return maxRevenue;
}

// ============================================================================
// ANALYSIS AND INSIGHTS FUNCTIONS
// ============================================================================

/**
 * Intelligent analysis of offers with comprehensive insights
 */
function analyzeOffersIntelligent(offers: OfferSummary[]): {
  summary: {
    total: number;
    active: number;
    topOffers: number;
    withCreatives: number;
    withLandings: number;
  };
  insights: string[];
  recommendations: string[];
  categories: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  advertisers: { name: string; count: number }[];
} {
  if (!offers?.length) {
    return {
      summary: { total: 0, active: 0, topOffers: 0, withCreatives: 0, withLandings: 0 },
      insights: ['No offers found'],
      recommendations: ['Try broadening your search criteria', 'Check your filters', 'Use more general terms'],
      categories: [],
      countries: [],
      advertisers: []
    };
  }

  // Basic metrics
  const active = offers.filter(o => o.status === 'active').length;
  const topOffers = offers.filter(o => o.is_top).length;
  const withCreatives = offers.filter(o => o.landings?.length > 0).length;
  const withLandings = offers.filter(o => o.landings?.length > 0).length;

  // Category analysis
  const categoryMap = new Map<string, number>();
  offers.forEach(offer => {
    offer.categories.forEach(cat => {
      if (cat) {
        categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
      }
    });
  });
  const categories = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Country analysis
  const countryMap = new Map<string, number>();
  offers.forEach(offer => {
    offer.countries.forEach(country => {
      if (country) {
        countryMap.set(country, (countryMap.get(country) || 0) + 1);
      }
    });
  });
  const countries = Array.from(countryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Advertiser analysis
  const advertiserMap = new Map<string, number>();
  offers.forEach(offer => {
    if (offer.advertiser) {
      advertiserMap.set(offer.advertiser, (advertiserMap.get(offer.advertiser) || 0) + 1);
    }
  });
  const advertisers = Array.from(advertiserMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Generate insights
  const insights = [];
  const activeRatio = active / offers.length;
  const topRatio = topOffers / offers.length;
  const creativesRatio = withCreatives / offers.length;
  const landingsRatio = withLandings / offers.length;

  if (activeRatio < 0.5) {
    insights.push(`Only ${Math.round(activeRatio * 100)}% of offers are active - consider filtering for active offers only`);
  } else if (activeRatio > 0.8) {
    insights.push(`Excellent: ${Math.round(activeRatio * 100)}% of offers are active and ready to promote`);
  }

  if (topRatio > 0.3) {
    insights.push(`High quality portfolio: ${Math.round(topRatio * 100)}% are top-performing offers`);
  } else if (topRatio < 0.1) {
    insights.push(`Low top offer ratio: only ${Math.round(topRatio * 100)}% are marked as top offers`);
  }

  if (creativesRatio < 0.6) {
    insights.push(`${Math.round((1 - creativesRatio) * 100)}% of offers may lack sufficient creative materials`);
  }

  if (landingsRatio < 0.7) {
    insights.push(`${Math.round((1 - landingsRatio) * 100)}% of offers may lack optimized landing pages`);
  }

  if (categories.length > 0) {
    insights.push(`Most common category: ${categories[0].name} (${categories[0].count} offers, ${Math.round(categories[0].count / offers.length * 100)}%)`);
  }

  if (countries.length > 0) {
    insights.push(`Most targeted country: ${countries[0].name} (${countries[0].count} offers)`);
  }

  // Revenue analysis
  const revenues = offers.map(o => o.revenue).filter(r => r > 0);
  if (revenues.length > 0) {
    const avgRevenue = revenues.reduce((a, b) => a + b, 0) / revenues.length;
    const maxRevenue = Math.max(...revenues);
    insights.push(`Revenue range: $${avgRevenue.toFixed(2)} average, $${maxRevenue.toFixed(2)} maximum`);
  }

  // Generate recommendations
  const recommendations = [];
  if (activeRatio < 0.7) {
    recommendations.push('Focus on active offers for better performance - add status:active filter');
  }
  if (creativesRatio < 0.8) {
    recommendations.push('Request additional creatives for offers with limited materials');
  }
  if (topRatio > 0.2) {
    recommendations.push('Prioritize top offers - they typically have higher conversion rates');
  }
  if (categories.length > 5) {
    recommendations.push('Consider specializing in your top-performing categories for better results');
  }
  if (offers.length > 50) {
    recommendations.push('Use more specific filters to focus on your most relevant offers');
  }
  if (revenues.length > 0 && revenues.some(r => r > 50)) {
    recommendations.push('Focus on higher-revenue offers for better ROI');
  }

  return {
    summary: {
      total: offers.length,
      active,
      topOffers,
      withCreatives,
      withLandings
    },
    insights,
    recommendations,
    categories,
    countries,
    advertisers
  };
}

/**
 * Enhance result message with context
 */
function enhanceMessageWithContext(
  originalMessage: string,
  parsedQuery: ParsedQuery | undefined,
  offerCount: number,
  searchType: string
): string {
  if (!parsedQuery) {
    return `${originalMessage} (${searchType} search)`;
  }
  
  const context = [];
  
  if (parsedQuery.verticals.length > 0) {
    context.push(`${parsedQuery.verticals.join(', ')} offers`);
  }
  
  if (parsedQuery.countries.length > 0) {
    context.push(`targeting ${parsedQuery.countries.join(', ')}`);
  }
  
  if (parsedQuery.os.length > 0) {
    context.push(`for ${parsedQuery.os.join(', ')} devices`);
  }

  const contextStr = context.length > 0 ? ` (${context.join(', ')})` : '';
  const queryStr = parsedQuery.originalQuery ? ` matching "${parsedQuery.originalQuery}"` : '';
  
  return `${originalMessage}${contextStr}${queryStr}`;
}

/**
 * Generate unified recommendations based on search type and results
 */
function generateUnifiedRecommendations(
  parsedQuery: ParsedQuery | undefined,
  offers: OfferSummary[],
  searchType: string,
  insights: any
): string[] {
  const recommendations = [];

  // Search type specific recommendations
  if (searchType === 'natural_language' && parsedQuery) {
    if (parsedQuery.verticals.length === 0 && parsedQuery.countries.length === 0 && parsedQuery.os.length === 0) {
      recommendations.push('Try being more specific: add category (gaming, finance), country (US, UK), or device (mobile, desktop)');
    }

    if (parsedQuery.verticals.length > 0 && offers.length === 0) {
      recommendations.push(`No ${parsedQuery.verticals.join('/')} offers found. Try related terms or remove filters`);
    }

    if (parsedQuery.countries.length > 0) {
      const availableCountries = [...new Set(offers.flatMap(o => o.countries))].slice(0, 5);
      if (availableCountries.length > 0) {
        recommendations.push(`Other available countries: ${availableCountries.join(', ')}`);
      }
    }
  }

  if (searchType === 'structured') {
    recommendations.push('Consider using natural language queries for more intuitive searching');
  }

  if (searchType === 'hybrid') {
    recommendations.push('Hybrid search combines the best of both natural language and structured filtering');
  }

  // Performance insights
  const topOffers = offers.filter(o => o.is_top).length;
  if (topOffers > 0) {
    recommendations.push(`${topOffers} top-performing offers found - prioritize these for better results`);
  }

  // Approval warnings
  const needsApproval = offers.filter(o => o.required_approval).length;
  if (needsApproval > offers.length * 0.7) {
    recommendations.push('Most offers require approval - apply in advance to avoid delays');
  }

  // Revenue optimization
  const highRevenueOffers = offers.filter(o => o.revenue > 50).length;
  if (highRevenueOffers > 0) {
    recommendations.push(`${highRevenueOffers} high-revenue offers available - focus on these for better earnings`);
  }

  return recommendations;
}

/**
 * Create error result with consistent format
 */
function createErrorResult(message: string, searchType: string): UnifiedSearchResult {
  return {
    status: 'error',
    message,
    data: [],
    totalItems: 0,
    totalPages: 0,
    itemsRetrieved: 0,
    pagesProcessed: 0,
    executionTime: 0,
    requestCount: 0,
    averageRequestTime: 0,
    recommendations: [
      'Check your search parameters and API credentials',
      'Verify network connectivity to Affise server',
      'Try simplifying your search criteria'
    ],
    canContinue: false,
    errors: [message],
    warnings: [],
    timestamp: new Date().toISOString(),
    search_type: searchType as any,
    insights: {
      summary: { total: 0, active: 0, topOffers: 0, withCreatives: 0, withLandings: 0 },
      insights: [],
      recommendations: [],
      categories: [],
      countries: [],
      advertisers: []
    }
  };
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

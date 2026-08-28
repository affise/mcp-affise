/**
 * Natural-language → structured search parameter resolution.
 *
 * `parseQuery` turns a free-form query into a `ParsedQuery` (countries,
 * verticals, OS, quality filters). `buildSmartSearchParams` then maps
 * that intent onto the Affise /3.0/offers query shape — including a
 * round-trip to /3.0/offer/categories to resolve vertical names into
 * concrete category ids. Heuristics live here so the search core stays
 * thin and the lookup tables are easy to maintain in one place.
 *
 * Extracted from the original unified_affise_offers.ts. Behaviour is
 * preserved verbatim.
 */

import type { ParsedQuery } from './unified_affise_offers.types.js';
import { makeAffiseRequest } from './unified_affise_offers.api.js';

/**
 * Parse natural language queries into structured search parameters
 */
export async function parseQuery(query: string): Promise<ParsedQuery> {
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
export async function buildSmartSearchParams(
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

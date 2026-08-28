/**
 * Insights, recommendations, error formatting for the unified offers
 * search result.
 *
 * - `analyzeOffersIntelligent` — turns OfferSummary[] into the
 *   `insights` block (active/top/creatives ratios, top categories,
 *   countries, advertisers, revenue stats, free-form bullet points).
 * - `enhanceMessageWithContext` — appends NLP parsed-query context to
 *   the user-facing message so "Found N offers" becomes "Found N offers
 *   (gaming offers targeting US for iOS, Android devices)".
 * - `generateUnifiedRecommendations` — suggests follow-up filters based
 *   on search type + result shape.
 * - `createErrorResult` — uniform error envelope for the search core.
 *
 * Extracted from unified_affise_offers.ts. Pure helpers — no I/O.
 */

import type {
  OfferSummary,
  ParsedQuery,
  UnifiedSearchResult,
} from './unified_affise_offers.types.js';

/**
 * Intelligent analysis of offers with comprehensive insights
 */
export function analyzeOffersIntelligent(offers: OfferSummary[]): {
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
export function enhanceMessageWithContext(
  originalMessage: string,
  parsedQuery: ParsedQuery | undefined,
  _offerCount: number,
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
export function generateUnifiedRecommendations(
  parsedQuery: ParsedQuery | undefined,
  offers: OfferSummary[],
  searchType: string,
  _insights: any
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
export function createErrorResult(message: string, searchType: string): UnifiedSearchResult {
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

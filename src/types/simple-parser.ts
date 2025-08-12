import { validateFieldCombination, autoFixFieldCombination, normalizeFieldNames } from './field-validator.js';
import { getDateRange } from '../shared/date-utils.js';

// Simple query interpretation
export interface SimpleQueryInfo {
  original: string;
  confidence: number;
  countries: string[];
  categories: string[];
  devices: string[];
  time_period?: string;
  metrics: string[];
  dimensions: string[];
  keywords: string[];
  suggestions: string[];
}

/**
 * Simple pattern matching for common query elements
 */
export function parseQuery(query: string): SimpleQueryInfo {
  const q = query.toLowerCase();
  
  // Country patterns
  const countries = extractCountries(q);
  
  // Category patterns  
  const categories = extractCategories(q);
  
  // Device patterns
  const devices = extractDevices(q);
  
  // Time patterns
  const time_period = extractTimePeriod(q);
  
  // Metric patterns
  const metrics = extractMetrics(q);
  
  // Dimension patterns
  const dimensions = extractDimensions(q);
  
  // Extract remaining keywords
  const keywords = extractKeywords(q);
  
  // Calculate confidence based on matches
  let confidence = 0.3;
  if (countries.length > 0) confidence += 0.2;
  if (categories.length > 0) confidence += 0.25;
  if (devices.length > 0) confidence += 0.15;
  if (time_period) confidence += 0.3;
  if (metrics.length > 0) confidence += 0.2;
  
  const suggestions = confidence < 0.7 ? generateSuggestions(q) : [];
  
  return {
    original: query,
    confidence: Math.min(confidence, 1.0),
    countries,
    categories,
    devices,
    time_period,
    metrics,
    dimensions,
    keywords,
    suggestions
  };
}

// Extract countries
function extractCountries(query: string): string[] {
  const countryMap: Record<string, string> = {
    'us': 'US', 'usa': 'US', 'united states': 'US',
    'uk': 'GB', 'britain': 'GB', 'england': 'GB',
    'germany': 'DE', 'france': 'FR', 'spain': 'ES',
    'italy': 'IT', 'canada': 'CA', 'australia': 'AU'
  };
  
  const found: string[] = [];
  for (const [pattern, code] of Object.entries(countryMap)) {
    if (query.includes(pattern)) {
      found.push(code);
    }
  }
  return [...new Set(found)];
}

// Extract categories
function extractCategories(query: string): string[] {
  const categories = ['gaming', 'dating', 'finance', 'health', 'travel', 'education', 'entertainment'];
  return categories.filter(cat => query.includes(cat));
}

// Extract devices
function extractDevices(query: string): string[] {
  const devices = [];
  if (query.includes('mobile') || query.includes('phone')) devices.push('mobile');
  if (query.includes('desktop') || query.includes('computer')) devices.push('desktop');
  if (query.includes('tablet')) devices.push('tablet');
  return devices;
}

// Extract time period
function extractTimePeriod(query: string): string | undefined {
  const timePatterns: Record<string, string> = {
    'today': 'today',
    'yesterday': 'yesterday',
    'last 7 days': 'last7days',
    'last week': 'lastweek',
    'this week': 'thisweek',
    'last month': 'lastmonth',
    'this month': 'thismonth',
    'last 30 days': 'last30days'
  };
  
  for (const [pattern, period] of Object.entries(timePatterns)) {
    if (query.includes(pattern)) {
      return period;
    }
  }
  return undefined;
}

// Extract metrics
function extractMetrics(query: string): string[] {
  const metricMap: Record<string, string> = {
    'revenue': 'income',
    'earnings': 'earnings',        // FIXED: Keep as 'earnings', not 'income'
    'earning': 'earnings',         // FIXED: Add singular form mapping
    'conversions': 'conversions',  // FIXED: Keep as 'conversions', not 'conversions_confirmed'
    'clicks': 'clicks',
    'conversion rate': 'cr',
    'cr': 'cr',
    'epc': 'epc',
    'payouts': 'payouts',
    'traffic': 'clicks',
    'views': 'views',
    'impressions': 'views',
    'ctr': 'cr',
    'ecpm': 'ecpm',
    'confirmed': 'conversions_confirmed',
    'pending': 'conversions_pending',
    'declined': 'conversions_declined',
    'hold': 'conversions_hold'
  };
  
  const found: string[] = [];
  for (const [pattern, metric] of Object.entries(metricMap)) {
    if (query.includes(pattern)) {
      found.push(metric);
    }
  }
  
  // Add default metrics for performance reports
  if (query.includes('performance') || query.includes('statistics report')) {
    const defaultMetrics = ['clicks', 'conversions', 'income', 'earnings', 'cr', 'epc'];
    for (const metric of defaultMetrics) {
      if (!found.includes(metric)) {
        found.push(metric);
      }
    }
  }
  
  // Handle status-specific conversion queries
  if (query.includes('conversions by status') || query.includes('conversion status')) {
    found.push('conversions_confirmed', 'conversions_pending', 'conversions_declined');
  }
  
  return [...new Set(found)];
}

// Extract dimensions
function extractDimensions(query: string): string[] {
  const dimensionMap: Record<string, string> = {
    'by day': 'day',
    'daily': 'day',
    'by country': 'country',
    'by offer': 'offer',
    'by affiliate': 'affiliate',
    'by device': 'device',
    'by conversions goal': 'goal', // For conversion status
    'breakdown': 'day', // Default breakdown
    'by hour': 'hour',
    'hourly': 'hour',
    'by month': 'month',
    'monthly': 'month',
    'by smartlink':'smart_id',
    'by advertiser': 'advertiser',
    'by partner': 'affiliate',  // Maps partner to affiliate
    'by publisher': 'affiliate',  // Maps publisher to affiliate
    'by pub': 'affiliate',  // Maps pub to affiliate
    'by browser': 'browser',
    'by os': 'os'
  };
  
  const found: string[] = [];
  
  // Check explicit dimension patterns
  for (const [pattern, dimension] of Object.entries(dimensionMap)) {
    if (query.includes(pattern)) {
      found.push(dimension);
    }
  }
  
  // CRITICAL FIX: Handle "top N" patterns that should trigger dimensions
  // This is what was missing and causing the partner/affiliate issue!
  
  if (query.match(/top\s+\d+\s+offers?/i)) {
    if (!found.includes('offer')) {
      found.push('offer');
    }
  }
  
  // The key fix: "top 10 affiliates" should add 'affiliate' dimension
  if (query.match(/top\s+\d+\s+affiliates?/i)) {
    if (!found.includes('affiliate')) {
      found.push('affiliate');
    }
  }
  
  // "top N partners" should also map to affiliate
  if (query.match(/top\s+\d+\s+partners?/i)) {
    if (!found.includes('affiliate')) {
      found.push('affiliate');
    }
  }
  
  if (query.match(/top\s+\d+\s+countries?/i)) {
    if (!found.includes('country')) {
      found.push('country');
    }
  }
  
  if (query.match(/top\s+\d+\s+advertisers?/i)) {
    if (!found.includes('advertiser')) {
      found.push('advertiser');
    }
  }
  
  // Handle complex breakdown requests
  if (query.includes('complete breakdown') || query.includes('detailed breakdown')) {
    // For complex breakdowns, use multiple dimensions
    if (query.includes('offer') && query.includes('country')) {
      found.push('day', 'country', 'offer');
    }
  }
  
  return [...new Set(found)];
}

// Extract remaining keywords
function extractKeywords(query: string): string[] {
  const excludeWords = [
    'show', 'find', 'get', 'search', 'the', 'and', 'or', 'for', 'in', 'with', 'by',
    'revenue', 'conversions', 'clicks', 'today', 'yesterday', 'last', 'this'
  ];
  
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !excludeWords.includes(word))
    .filter((word, index, arr) => arr.indexOf(word) === index); // Remove duplicates
}

// Generate suggestions for low confidence queries
function generateSuggestions(query: string): string[] {
  const suggestions = [];
  
  if (!extractTimePeriod(query)) {
    suggestions.push('Add a time period like "last month" or "today"');
  }
  
  if (!extractCountries(query).length) {
    suggestions.push('Specify a country like "US" or "UK"');
  }
  
  if (!extractMetrics(query).length && !extractCategories(query).length) {
    suggestions.push('Add metrics like "revenue" or categories like "gaming"');
  }
  
  return suggestions.slice(0, 2);
}

/**
 * Convert parsed query to search parameters
 */
export function toSearchParams(parsed: SimpleQueryInfo): any {
  const params: any = {};
  
  if (parsed.countries.length > 0) {
    params.countries = parsed.countries;
  }
  
  if (parsed.categories.length > 0) {
    params.categories = parsed.categories;
  }
  
  if (parsed.devices.length > 0) {
    params.device = parsed.devices;
  }
  
  if (parsed.keywords.length > 0) {
    params.q = parsed.keywords.join(' ');
  }
  
  return params;
}

/**
 * Convert parsed query to stats parameters with field validation
 */
export function toStatsParams(parsed: SimpleQueryInfo): any {
  const params: any = {};
  
  // Set dimensions
  if (parsed.dimensions.length > 0) {
    params.slice = parsed.dimensions;
  } else {
    params.slice = ['day']; // Default
  }
  
  // Set metrics and normalize field names
  let fields: string[] = parsed.metrics.length > 0 
    ? parsed.metrics 
    : ['clicks', 'conversions', 'income', 'cr']; // Default
  
  // Normalize field names (revenue -> income, conversions -> conversions_confirmed, etc.)
  fields = normalizeFieldNames(fields);
  
  // Validate field combination and auto-fix if needed
  const validation = validateFieldCombination(params.slice, fields);
  
  if (!validation.valid) {
    // Auto-fix the combination
    const fixed = autoFixFieldCombination(params.slice, fields);
    params.slice = [...fixed.slices]; // Convert readonly to mutable
    fields = [...fixed.fields]; // Convert readonly to mutable
    
    // If still empty after fixes, use safe defaults
    if (params.slice.length === 0) {
      params.slice = ['day'];
    }
    if (fields.length === 0) {
      fields = ['clicks', 'income'];
    }
  }
  
  params.fields = fields;
  
  // Set filters
  if (parsed.countries.length > 0) {
    params.country = parsed.countries;
  }
  
  if (parsed.devices.length > 0) {
    params.device = parsed.devices;
  }
  
  // Set time period
  if (parsed.time_period) {
    params.period = parsed.time_period;
  } else {
    params.period = 'last7days'; // Default
  }
  
  return params;
}

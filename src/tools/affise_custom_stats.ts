import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';
import { AffiseStatsPagination, SmartPaginationResult } from './smart_pagination.js';

// Complete slice options based on real API
type SliceType = 
  | 'advertiser_manager_id'  // Advertiser manager ID
  | 'advertiser'             // Advertiser ID
  | 'affiliate'              // Affiliate/Partner ID/pub/ partner/publisher
  | 'affiliate_manager_id'   // Affiliate manager ID
  | 'browser'                // Browser type (Chrome, Firefox, etc.)
  | 'browser_version'        // Browser version
  | 'city'                   // City name
  | 'conn_type'              // Connection type (WiFi, Mobile, etc.)
  | 'country'                // Country code (US, GB, etc.)
  | 'day'                    // Date (day-by-day breakdown)
  | 'device'                 // Device type (desktop, mobile, tablet)
  | 'device_model'           // Specific device model
  | 'goal'                   // Goal/conversion goal
  | 'hour'                   // Hour of day (0-23)
  | 'isp'                    // Internet Service Provider
  | 'landing'                // Landing page ID
  | 'manager'                // Manager ID
  | 'month'                  // Month (monthly breakdown)
  | 'offer'                  // Offer ID
  | 'os'                     // Operating System
  | 'os_version'             // Operating System version
  | 'prelanding'             // Pre-landing page ID
  | 'quarter'                // Quarter (quarterly breakdown)
  | 'smart_id'               // SmartLink category ID
  | 'sub1'                   // Sub ID 1 (tracking parameter)
  | 'sub2'                   // Sub ID 2
  | 'sub3'                   // Sub ID 3
  | 'sub4'                   // Sub ID 4
  | 'sub5'                   // Sub ID 5
  | 'sub6'                   // Sub ID 6 (additional tracking)
  | 'sub7'                   // Sub ID 7 (additional tracking)
  | 'sub8'                   // Sub ID 8 (additional tracking)
  | 'trafficback_reason'     // Reason for traffic being sent back
  | 'year';                  // Year (yearly breakdown)

// Complete field options based on real API
type FieldType = 
  | 'clicks'         // Total clicks
  | 'hosts'          // Unique traffic sources/hosts
  | 'earnings'       // Net earnings (revenue - payouts)
  | 'income'         // Gross income/revenue
  | 'noincome'       // income = 0 and conversion status = 'confirmed'
  | 'payouts'        // Affiliate payouts/commissions
  | 'conversions'    // Total conversions
  | 'cr'             // Conversion Rate (conversions/clicks)
  | 'affiliate_epc'  // Affiliate EPC
  | 'ratio'          // Conversion ratio metrics
  | 'epc'            // Earnings Per Click (revenue/clicks)
  | 'trafficback'    // Redirected/bounced traffic
  | 'afprice'        // Affiliate price/payout amount
  | 'ctr'            // Click-through rate
  | 'views'          // Impressions/ad views
  | 'ecpm'           // Effective Cost Per Mille (revenue per 1000 impressions)
  | 'costs'          // Costs
  | 'margin'         // Margin metrics
  | 'roi';           // Return on investment


// Conversion types
type ConversionType = 
  | 'confirmed'      // Approved/confirmed conversions
  | 'declined'       // Rejected conversions
  | 'hold'           // Conversions on hold
  | 'pending'        // Pending review conversions
  | 'total';         // All conversions combined

interface CustomStatsParams {
  // === REQUIRED PARAMETERS ===
  slice: SliceType[];                    // REQUIRED: Data slicing dimensions
  date_from: string;                     // REQUIRED: Start date (YYYY-MM-DD)
  date_to: string;                      // REQUIRED: End date (YYYY-MM-DD)

  // === DISPLAY FIELDS ===
  fields?: FieldType[];                  // Metrics to include in response
  conversionTypes?: ConversionType[];    // Conversion status types to include

  // === FILTER PARAMETERS ===
  // Geographic filters
  country?: string[];                    // Country codes (e.g., ["US", "GB"])
  city?: string[];                      // City names

  // Entity filters
  advertiser?: string[];                 // Advertiser IDs
  advertiser_manager_id?: string[];      // Advertiser manager IDs
  affiliate?: string[];                  // Affiliate/Partner IDs (admin only)
  affiliate_manager_id?: string[];       // Affiliate manager IDs
  offer?: number[];                     // Offer IDs
  smart_id?: string[];                  // SmartLink category IDs
  manager?: string[];                   // Manager IDs

  // Technical filters
  os?: string[];                        // Operating systems
  os_version?: string[];                // Operating system versions
  browser?: string[];                   // Browser types
  browser_version?: string[];           // Browser versions
  device?: string[];                    // Device types
  device_model?: string[];              // Device models
  conn_type?: string[];                 // Connection types
  isp?: string[];                       // ISP names

  // Campaign tracking filters
  sub1?: string[];                      // Sub ID 1 values
  sub2?: string[];                      // Sub ID 2 values
  sub3?: string[];                      // Sub ID 3 values
  sub4?: string[];                      // Sub ID 4 values
  sub5?: string[];                      // Sub ID 5 values
  sub6?: string[];                      // Sub ID 6 values
  sub7?: string[];                      // Sub ID 7 values
  sub8?: string[];                      // Sub ID 8 values

  // Page filters
  landing?: string[];                   // Landing page IDs
  prelanding?: string[];                // Pre-landing page IDs

  // Other filters
  currency?: string[];                  // Currency codes
  goal?: string[];                      // Goal names
  trafficback_reason?: string[];        // Traffic back reasons
  nonzero?: 0 | 1;                     // Non-zero conversions only

  // Tag filters (comma-separated strings)
  advertiser_tag?: string;              // Advertiser tags
  affiliate_tag?: string;               // Affiliate tags
  offer_tag?: string;                   // Offer tags

  // === PAGINATION & SORTING ===
  page?: number;                        // Page number (default: 1)
  limit?: number;                       // Results per page (default: 100, max: 500)
  orderType?: 'asc' | 'desc';          // Sort direction
  order?: string[];                     // Fields to sort by. Available: hour, month, quarter, year, day, currency, offer, country, city, os, os_version, device, device_model, browser, goal, sub1, sub2, sub3, sub4, sub5, confirmed_earning, raw, uniq, total_count, total_revenue, total_null, pending_count, pending_revenue, declined_count, declined_revenue, hold_count, hold_revenue, confirmed_count, confirmed_revenue. Admin only: advertiser, affiliate, manager

  // === LOCALIZATION & TIMEZONE ===
  locale?: 'en' | 'ru' | 'es';         // Response language
  timezone?: string;                    // Timezone (e.g., "Europe/Moscow", "UTC")
}

interface AffiseCustomStatsResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  metadata?: {
    total_records: number;
    date_range: string;
    slice_by: string[];
    filters_applied: string[];
    page_info: {
      current_page: number;
      total_pages: number;
      per_page: number;
      total_count: number;
    };
    analysis_type?: string;
  };
  timestamp: string;
}

export async function getAffiseCustomStats(
  config: { baseUrl: string; apiKey: string },
  params: CustomStatsParams
): Promise<AffiseCustomStatsResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: getCurrentTimestamp()
    };
  }

  if (!params.slice || !params.date_from || !params.date_to) {
    return {
      status: 'error',
      message: 'slice, date_from, and date_to are required parameters',
      timestamp: getCurrentTimestamp()
    };
  }

  try {
    const url = `${baseUrl}/3.0/stats/custom`;
    const queryParams = new URLSearchParams();

    // Add required parameters - slice arrays first
    params.slice.forEach(s => queryParams.append('slice[]', s));
    queryParams.append('filter[date_from]', params.date_from);
    queryParams.append('filter[date_to]', params.date_to);

    // Add fields
    if (params.fields?.length) {
      params.fields.forEach(f => queryParams.append('fields[]', f));
    }

    // Add conversion types
    if (params.conversionTypes?.length) {
      params.conversionTypes.forEach(ct => queryParams.append('conversionTypes[]', ct));
    }

    // Add pagination and sorting
    queryParams.append('page', (params.page || 1).toString());
    queryParams.append('limit', (params.limit || 100).toString());
    
    if (params.orderType) {
      queryParams.append('orderType', params.orderType);
    }

    // Ensure order is an array before using forEach
    if (params.order && Array.isArray(params.order) && params.order.length > 0) {
      params.order.forEach(o => queryParams.append('order[]', o));
    }

    // Add all filter parameters
    const arrayFilters = [
      'country', 'city', 'advertiser', 'advertiser_manager_id', 'affiliate', 
      'affiliate_manager_id', 'offer', 'smart_id', 'os', 'os_version', 'browser', 
      'browser_version', 'device', 'device_model', 'conn_type', 'isp',
      'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
      'landing', 'prelanding', 'currency', 'manager', 'goal', 'trafficback_reason'
    ];

    arrayFilters.forEach(filter => {
      const values = (params as any)[filter];
      if (Array.isArray(values) && values.length > 0) {
        values.forEach((value: any) => {
          queryParams.append(`filter[${filter}][]`, String(value));
        });
      }
    });

    // Add single value filters
    if (params.nonzero !== undefined) {
      queryParams.append('filter[nonzero]', params.nonzero.toString());
    }

    if (params.advertiser_tag) {
      queryParams.append('filter[advertiser_tag]', params.advertiser_tag);
    }

    if (params.affiliate_tag) {
      queryParams.append('filter[affiliate_tag]', params.affiliate_tag);
    }

    if (params.offer_tag) {
      queryParams.append('filter[offer_tag]', params.offer_tag);
    }

    // Add localization options
    if (params.locale) {
      queryParams.append('locale', params.locale);
    }

    if (params.timezone) {
      queryParams.append('timezone', params.timezone);
    }

    const fullUrl = `${url}?${queryParams.toString()}`;

    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.info('Custom Stats API URL:', fullUrl);
    }

    const response = await axios.get(fullUrl, {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 45000,
      validateStatus: function (status) {
        return status < 500;
      }
    });

    // Handle HTTP status codes
    if (response.status === 401) {
      return {
        status: 'error',
        message: 'Authentication failed - check API key',
        timestamp: getCurrentTimestamp()
      };
    }

    if (response.status === 403) {
      return {
        status: 'error',
        message: 'Access forbidden - insufficient permissions for custom stats API',
        timestamp: getCurrentTimestamp()
      };
    }

    if (response.status >= 400) {
      return {
        status: 'error',
        message: `Custom stats API returned error: ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`,
        timestamp: getCurrentTimestamp()
      };
    }

    // Extract metadata
    const data = response.data;
    const sliceInfo = Array.isArray(params.slice) ? params.slice : [params.slice];
    
    // Build filters applied list
    const filtersApplied = [];
    if (params.currency?.length) filtersApplied.push(`currency: ${params.currency.join(', ')}`);
    if (params.advertiser?.length) filtersApplied.push(`advertiser: ${params.advertiser.length} items`);
    if (params.offer?.length) filtersApplied.push(`offers: ${params.offer.length} items`);
    if (params.country?.length) filtersApplied.push(`countries: ${params.country.join(', ')}`);
    if (params.city?.length) filtersApplied.push(`cities: ${params.city.length} items`);
    if (params.os?.length) filtersApplied.push(`OS: ${params.os.join(', ')}`);
    if (params.device?.length) filtersApplied.push(`devices: ${params.device.join(', ')}`);
    if (params.browser?.length) filtersApplied.push(`browsers: ${params.browser.join(', ')}`);
    if (params.affiliate?.length) filtersApplied.push(`affiliates: ${params.affiliate.length} items`);
    if (params.sub1?.length) filtersApplied.push(`sub1: ${params.sub1.length} items`);
    if (params.nonzero) filtersApplied.push('non-zero conversions only');
    if (params.timezone) filtersApplied.push(`timezone: ${params.timezone}`);

    const totalRecords = Array.isArray(data.stats) ? data.stats.length : 0;
    const pagination = data.pagination || {};

    return {
      status: 'ok',
      message: `Retrieved ${totalRecords} custom statistics records`,
      data: data,
      metadata: {
        total_records: totalRecords,
        date_range: `${params.date_from} to ${params.date_to}`,
        slice_by: sliceInfo,
        filters_applied: filtersApplied,
        page_info: {
          current_page: params.page || 1,
          total_pages: pagination.pages || 1,
          per_page: params.limit || 100,
          total_count: pagination.count || totalRecords
        }
      },
      timestamp: getCurrentTimestamp()
    };

  } catch (error: any) {
    let errorMessage = 'Unknown error';

    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Affise custom stats server';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Custom stats request timeout exceeded';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Affise custom stats server not found (DNS error)';
    } else if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        errorMessage = 'Authentication failed - check API key';
      } else if (status === 403) {
        errorMessage = 'Access forbidden - insufficient permissions for custom stats API';
      } else if (status === 400) {
        errorMessage = `Bad request - check parameters: ${error.response.data?.message || 'Invalid parameters'}`;
      } else if (status === 429) {
        errorMessage = 'Rate limit exceeded - too many requests';
      } else {
        errorMessage = error.response.data?.message || `HTTP ${status}: ${error.response.statusText}`;
      }
    } else {
      errorMessage = error.message;
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Full Affise API Error:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response headers:', error.response.headers);
      }
    }

    return {
      status: 'error',
      message: `Error retrieving custom statistics: ${errorMessage}`,
      timestamp: getCurrentTimestamp()
    };
  }
}

// Enhanced preset configurations with slice options
export function createCustomStatsPresets() {
  return {
    // Enhanced monthly performance by offer
    monthlyByOffer: (dateFrom: string, dateTo: string, offers?: number[]) => ({
      slice: ['month', 'offer'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      offer: offers,
      fields: ['hosts', 'clicks', 'conversions', 'earnings', 'cr', 'epc', 'views', 'income', 'payouts'] as FieldType[],
      conversionTypes: ['confirmed', 'pending','hold', 'declined', 'total'] as ConversionType[],
      orderType: 'desc' as const,
      order: ['month']
    }),

    // Enhanced performance by country
    performanceByCountry: (dateFrom: string, dateTo: string, countries?: string[]) => ({
      slice: ['country', 'city'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      country: countries,
      fields: ['clicks', 'conversions', 'earnings', 'cr', 'epc', 'views', 'ecpm'] as FieldType[],
      conversionTypes: ['confirmed'] as ConversionType[],
      orderType: 'desc' as const,
      order: ['earnings']
    }),

    // Detailed funnel analysis with enhanced metrics
    funnelAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['day'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['views', 'clicks', 'conversions', 'earnings', 'income', 'payouts', 'cr', 'epc', 'ecpm', 'trafficback'] as FieldType[],
      conversionTypes: ['total', 'confirmed', 'pending', 'declined', 'hold'] as ConversionType[],
      orderType: 'asc' as const,
      order: ['day']
    }),

    // Enhanced traffic source analysis
    trafficSourceAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['sub1', 'sub2', 'sub3'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['clicks', 'conversions', 'earnings', 'cr', 'epc', 'trafficback', 'hosts'] as FieldType[],
      nonzero: 1 as const,
      orderType: 'desc' as const,
      order: ['earnings']
    }),

    // NEW: Technical performance analysis
    technicalAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['device', 'os', 'browser', 'conn_type'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['clicks', 'conversions', 'cr', 'epc', 'earnings', 'trafficback'] as FieldType[],
      conversionTypes: ['confirmed', 'declined'] as ConversionType[],
      orderType: 'desc' as const,
      order: ['conversions']
    }),

    // NEW: Geographic deep dive
    geoAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['country', 'city', 'isp'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['clicks', 'conversions', 'earnings', 'cr', 'epc', 'views', 'ecpm'] as FieldType[],
      conversionTypes: ['confirmed'] as ConversionType[],
      nonzero: 1 as const,
      orderType: 'desc' as const,
      order: ['earnings']
    }),

    //Partner performance analysis
    partnerAnalysis: (dateFrom: string, dateTo: string, timezone?: string) => ({
      slice: [
        'affiliate'
      ] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: [
        'clicks',
        'cr',
        'earnings',
        'epc',
        'hosts',
        'income',
        'payouts',
        'ratio',
        'conversions'
      ] as FieldType[],
      conversionTypes: [
        'confirmed'
      ] as ConversionType[],
      limit: 100,
      timezone: timezone || 'UTC'
    }),

    // Advertiser performance analysis
    advertiserAnalysis: (dateFrom: string, dateTo: string, timezone?: string) => ({
      slice: [
        'advertiser'
      ] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: [
        'clicks',
        'cr',
        'earnings',
        'epc',
        'hosts',
        'income',
        'ratio',
        'conversions'
      ] as FieldType[],
      conversionTypes: [
        'confirmed'
      ] as ConversionType[],
      limit: 100,
      timezone: timezone || 'UTC'
    }),

    // Landing page optimization
    landingPageAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['landing', 'prelanding'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['views', 'clicks', 'conversions', 'cr', 'trafficback', 'earnings'] as FieldType[],
      conversionTypes: ['confirmed', 'declined'] as ConversionType[],
      orderType: 'desc' as const,
      order: ['cr']
    }),

    // Hourly performance patterns
    hourlyAnalysis: (dateFrom: string, dateTo: string, timezone?: string) => ({
      slice: [
        'day',
        'hour'
      ] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: [
        'clicks',
        'cr',
        'earnings',
        'epc',
        'hosts',
        'income',
        'payouts',
        'ratio',
        'conversions'
      ] as FieldType[],
      conversionTypes: [
        'confirmed'
      ] as ConversionType[],
      limit: 100,
      timezone: timezone || 'UTC'
    }),

    // Weekly analysis preset with comprehensive slicing
    weekly: (dateFrom: string, dateTo: string, timezone?: string) => ({
      slice: [
        'advertiser_manager_id',
        'advertiser',
        'affiliate',
        'affiliate_manager_id',
        'country',
        'day',
        'month',
        'offer',
        'year'
      ] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: [
        'clicks',
        'income',
        'conversions'
      ] as FieldType[],
      conversionTypes: [
        'confirmed',
        'total'
      ] as ConversionType[],
      limit: 100,
      timezone: timezone || 'UTC'
    }),

    // Comprehensive analysis with all dimensions
    comprehensiveAnalysis: (dateFrom: string, dateTo: string) => ({
      slice: ['day', 'offer', 'country', 'device', 'sub1'] as SliceType[],
      date_from: dateFrom,
      date_to: dateTo,
      fields: ['views', 'clicks', 'conversions', 'earnings', 'income', 'payouts', 'cr', 'epc', 'ecpm', 'trafficback', 'hosts'] as FieldType[],
      conversionTypes: ['total', 'confirmed', 'pending', 'declined'] as ConversionType[],
      limit: 100,
      orderType: 'desc' as const,
      order: ['earnings']
    })
  };
}

// Export types for use in other files
export type { CustomStatsParams, SliceType, FieldType, ConversionType, AffiseCustomStatsResult };

// ============================================================================
// SMART PAGINATION IMPLEMENTATIONS
// ============================================================================

/**
 * Smart stats retrieval with intelligent pagination - RECOMMENDED FOR MOST USE CASES
 * 
 * This function uses the Smart Pagination Strategy to:
 * 1. Show sample results immediately for quick analysis
 * 2. Ask user confirmation for large datasets
 * 3. Provide intelligent performance insights
 * 4. Handle progress tracking and error recovery
 */
export async function smartGetAffiseStats(
  config: { baseUrl: string; apiKey: string },
  params: CustomStatsParams,
  options: {
    userIntent?: 'explore' | 'analyze' | 'export';
    autoComplete?: boolean;
    onProgress?: (progress: {
      page: number;
      totalPages: number;
      itemsRetrieved: number;
      estimatedTimeRemaining: number;
      message: string;
    }) => void;
  } = {}
): Promise<SmartPaginationResult<any>> {
  const { userIntent = 'analyze', autoComplete = false, onProgress } = options;

  // Create pagination instance with optimized config for stats
  const pagination = new AffiseStatsPagination({
    initialSampleSize: userIntent === 'explore' ? 50 : 100,
    largeDatasetThreshold: userIntent === 'export' ? 5000 : 1000,
    maxPageSize: 500,
    requestDelay: 200, // Stats API can be slower
    askUserConfirmation: !autoComplete
  });

  // Enhanced progress callback with analytics-focused messages
  const enhancedProgress = onProgress ? (progress: any) => {
    const timeRemaining = progress.estimatedTimeRemaining > 60000 
      ? `${Math.round(progress.estimatedTimeRemaining / 60000)}m`
      : `${Math.round(progress.estimatedTimeRemaining / 1000)}s`;
    
    onProgress({
      ...progress,
      message: `Analyzing page ${progress.page}/${progress.totalPages} • ${progress.itemsRetrieved} records processed • ${timeRemaining} remaining`
    });
  } : undefined;

  return await pagination.getStats(config, params, {
    userIntent,
    onProgress: enhancedProgress
  });
}

/**
 * Continue fetching all stats from a smart search continuation token
 */
export async function continueSmartStats(
  continuationToken: string,
  onProgress?: (progress: any) => void
): Promise<SmartPaginationResult<any>> {
  const pagination = new AffiseStatsPagination();
  return await pagination.engine.continueFromToken(continuationToken, { onProgress });
}

/**
 * Advanced stats analysis with intelligent insights
 */
export function analyzeStatsIntelligent(stats: any[]): {
  summary: {
    totalRecords: number;
    totalClicks: number;
    totalConversions: number;
    totalEarnings: number;
    averageCR: number;
    averageEPC: number;
    averageECPM: number;
  };
  insights: string[];
  recommendations: string[];
  timePatterns: { period: string; performance: any }[];
  geoPerformance: { country: string; metrics: any }[];
  devicePerformance: { device: string; metrics: any }[];
} {
  if (!stats?.length) {
    return {
      summary: {
        totalRecords: 0,
        totalClicks: 0,
        totalConversions: 0,
        totalEarnings: 0,
        averageCR: 0,
        averageEPC: 0,
        averageECPM: 0
      },
      insights: ['No statistics data found'],
      recommendations: ['Check your date range and filters'],
      timePatterns: [],
      geoPerformance: [],
      devicePerformance: []
    };
  }

  // Calculate summary metrics
  const totalClicks = stats.reduce((sum, s) => sum + (s.clicks || 0), 0);
  const totalConversions = stats.reduce((sum, s) => sum + (s.conversions || 0), 0);
  const totalEarnings = stats.reduce((sum, s) => sum + (s.earnings || 0), 0);
  const totalViews = stats.reduce((sum, s) => sum + (s.views || 0), 0);
  const totalTrafficback = stats.reduce((sum, s) => sum + (s.trafficback || 0), 0);

  const averageCR = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;
  const averageEPC = totalClicks > 0 ? (totalEarnings / totalClicks) : 0;
  const averageECPM = totalViews > 0 ? (totalEarnings / totalViews * 1000) : 0;

  // Time patterns analysis
  const timeData = stats.reduce((acc, stat) => {
    const day = stat.day || stat.date || 'unknown';
    if (!acc[day]) acc[day] = { clicks: 0, conversions: 0, earnings: 0 };
    acc[day].clicks += stat.clicks || 0;
    acc[day].conversions += stat.conversions || 0;
    acc[day].earnings += stat.earnings || 0;
    return acc;
  }, {} as Record<string, any>);

  const timePatterns = Object.entries(timeData)
    .map(([period, data]: [string, any]) => ({
      period,
      performance: {
        ...data,
        cr: data.clicks > 0 ? (data.conversions / data.clicks * 100) : 0,
        epc: data.clicks > 0 ? (data.earnings / data.clicks) : 0
      }
    }))
    .sort((a, b) => b.performance.earnings - a.performance.earnings)
    .slice(0, 10);

  // Geographic performance analysis
  const geoData = stats.reduce((acc, stat) => {
    const country = stat.country || 'unknown';
    if (!acc[country]) acc[country] = { clicks: 0, conversions: 0, earnings: 0, views: 0 };
    acc[country].clicks += stat.clicks || 0;
    acc[country].conversions += stat.conversions || 0;
    acc[country].earnings += stat.earnings || 0;
    acc[country].views += stat.views || 0;
    return acc;
  }, {} as Record<string, any>);

  const geoPerformance = Object.entries(geoData)
    .map(([country, data]: [string, any]) => ({
      country,
      metrics: {
        ...data,
        cr: data.clicks > 0 ? (data.conversions / data.clicks * 100) : 0,
        epc: data.clicks > 0 ? (data.earnings / data.clicks) : 0,
        ecpm: data.views > 0 ? (data.earnings / data.views * 1000) : 0
      }
    }))
    .sort((a, b) => b.metrics.earnings - a.metrics.earnings)
    .slice(0, 10);

  // Device performance analysis
  const deviceData = stats.reduce((acc, stat) => {
    const device = stat.device || 'unknown';
    if (!acc[device]) acc[device] = { clicks: 0, conversions: 0, earnings: 0 };
    acc[device].clicks += stat.clicks || 0;
    acc[device].conversions += stat.conversions || 0;
    acc[device].earnings += stat.earnings || 0;
    return acc;
  }, {} as Record<string, any>);

  const devicePerformance = Object.entries(deviceData)
    .map(([device, data]: [string, any]) => ({
      device,
      metrics: {
        ...data,
        cr: data.clicks > 0 ? (data.conversions / data.clicks * 100) : 0,
        epc: data.clicks > 0 ? (data.earnings / data.clicks) : 0
      }
    }))
    .sort((a, b) => b.metrics.earnings - a.metrics.earnings);

  // Generate insights
  const insights = [];
  const trafficbackRate = totalClicks > 0 ? (totalTrafficback / totalClicks * 100) : 0;
  const zeroConversionRecords = stats.filter(s => (s.conversions || 0) === 0).length;
  const zeroConversionRate = (zeroConversionRecords / stats.length * 100);

  if (averageCR < 1) {
    insights.push(`Low conversion rate (${averageCR.toFixed(2)}%) - investigate traffic quality`);
  } else if (averageCR > 5) {
    insights.push(`Excellent conversion rate (${averageCR.toFixed(2)}%) - high-quality traffic`);
  } else {
    insights.push(`Moderate conversion rate (${averageCR.toFixed(2)}%) - optimization potential`);
  }

  if (trafficbackRate > 10) {
    insights.push(`High trafficback rate (${trafficbackRate.toFixed(1)}%) - review traffic sources`);
  }

  if (zeroConversionRate > 30) {
    insights.push(`${zeroConversionRate.toFixed(1)}% of periods had zero conversions`);
  }

  if (averageEPC > 0.1) {
    insights.push(`Good EPC performance (${averageEPC.toFixed(2)}) - profitable traffic`);
  }

  if (geoPerformance.length > 0) {
    insights.push(`Top performing country: ${geoPerformance[0].country} (${geoPerformance[0].metrics.earnings.toLocaleString()})`);
  }

  if (devicePerformance.length > 0) {
    insights.push(`Top performing device: ${devicePerformance[0].device} (${devicePerformance[0].metrics.earnings.toLocaleString()})`);
  }

  // Generate recommendations
  const recommendations = [];
  if (averageCR < 2) {
    recommendations.push('Optimize traffic sources to improve conversion rates');
  }
  if (trafficbackRate > 15) {
    recommendations.push('Investigate and reduce trafficback sources');
  }
  if (averageEPC < 0.05) {
    recommendations.push('Focus on higher-paying offers or improve traffic quality');
  }
  if (zeroConversionRate > 40) {
    recommendations.push('Review periods with zero conversions for optimization opportunities');
  }
  if (geoPerformance.length > 1) {
    const topGeo = geoPerformance[0];
    const secondGeo = geoPerformance[1];
    if (topGeo.metrics.earnings > secondGeo.metrics.earnings * 2) {
      recommendations.push(`Focus more traffic on ${topGeo.country} - significantly outperforming other geos`);
    }
  }
  if (devicePerformance.length > 1) {
    const bestDevice = devicePerformance[0];
    if (bestDevice.metrics.cr > 3) {
      recommendations.push(`${bestDevice.device} traffic shows excellent performance - scale this traffic type`);
    }
  }

  return {
    summary: {
      totalRecords: stats.length,
      totalClicks,
      totalConversions,
      totalEarnings,
      averageCR,
      averageEPC,
      averageECPM
    },
    insights,
    recommendations,
    timePatterns,
    geoPerformance,
    devicePerformance
  };
}

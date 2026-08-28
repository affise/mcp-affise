/**
 * HTTP + data-shape helpers for the unified Affise offers search.
 *
 * - `makeAffiseRequest` — generic GET against Affise, used by NLP
 *   category resolution.
 * - `searchAffiseOffersLegacy` — single-page /3.0/offers fetch with
 *   `offers[]` + `pagination`. Preserved for the legacy code path that
 *   activates when callers pass `options.page` or `options.limit`.
 * - `createOfferSummary` / `extractOSTargeting` / `getHighestRevenue` —
 *   normalize the raw Affise offer object into the lean OfferSummary
 *   shape that the rest of the pipeline (analysis, recommendations,
 *   tools/list response) consumes.
 *
 * Extracted from the original unified_affise_offers.ts (1433 LOC). No
 * behavioural change — code moved verbatim.
 */

import axios from 'axios';
import type { OfferSummary, LegacySearchResult } from './unified_affise_offers.types.js';

/**
 * Make authenticated requests to Affise API with enhanced error handling
 */
export async function makeAffiseRequest(
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
        throw new Error("Affise URL not found — check for typos and that it's your tenant's public API URL");
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
 * Legacy search function for backward compatibility — single-page
 * /3.0/offers fetch with `offers[]` + `pagination`. Used when the caller
 * passes `page` or `limit` in options instead of letting the smart
 * pagination engine drive.
 */
export async function searchAffiseOffersLegacy(
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
        errorMessage = "Affise URL not found — check for typos and that it's your tenant's public API URL";
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
export function createOfferSummary(offer: any): OfferSummary {
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

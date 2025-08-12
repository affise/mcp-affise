import axios from 'axios';

export interface OfferCategoriesParams {
  ids?: string[];                    // Search by IDs
  page?: number;                     // Page of entities (default: 1)
  limit?: number;                    // Limit of entities (default: 99999, max: 99999)
  orderType?: 'asc' | 'desc';        // Sort direction (default: asc)
  order?: 'id' | 'title';            // Sort field (default: id)
}

export interface OfferCategory {
  id: string;
  title: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;  // Allow for additional fields
}

export interface AffiseOfferCategoriesResult {
  status: 'ok' | 'error';
  message: string;
  data?: {
    categories: OfferCategory[];
    pagination?: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
  timestamp: string;
}

/**
 * Get offer categories from Affise API
 * 
 * This function retrieves offer categories using the Affise API endpoint:
 * GET /3.0/offer/categories
 * 
 * @param config - Affise API configuration (baseUrl and apiKey)
 * @param params - Optional parameters for filtering and pagination
 * @returns Promise<AffiseOfferCategoriesResult>
 */
export async function getOfferCategories(
  config: { baseUrl: string; apiKey: string },
  params: OfferCategoriesParams = {}
): Promise<AffiseOfferCategoriesResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: new Date().toISOString()
    };
  }

  try {
    const url = `${baseUrl}/3.0/offer/categories`;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    
    // Add IDs if provided
    if (params.ids?.length) {
      params.ids.forEach(id => queryParams.append('ids[]', id));
    }
    
    // Add pagination parameters with defaults
    const page = params.page ?? 1;
    const limit = params.limit ?? 99999;
    const orderType = params.orderType ?? 'asc';
    const order = params.order ?? 'id';
    
    queryParams.append('page', page.toString());
    queryParams.append('limit', Math.min(limit, 99999).toString()); // Enforce max limit
    queryParams.append('orderType', orderType);
    queryParams.append('order', order);

    const fullUrl = `${url}?${queryParams.toString()}`;
    
    const response = await axios.get(fullUrl, {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json'
      },
      timeout: 30000 // 30 seconds timeout
    });

    if (response.status >= 400) {
      return {
        status: 'error',
        message: `API returned error: ${response.status} ${response.statusText}`,
        timestamp: new Date().toISOString()
      };
    }

    // Extract categories from response
    const categories: OfferCategory[] = response.data.categories || response.data || [];
    
    // Extract pagination info if available
    let pagination: { page: number; limit: number; total: number; pages: number } | undefined;
    
    if (response.data.pagination) {
      pagination = response.data.pagination;
    } else if (categories.length > 0) {
      // If no pagination info but we have data, construct basic pagination
      pagination = {
        page,
        limit,
        total: categories.length,
        pages: 1
      };
    }

    return {
      status: 'ok',
      message: `Found ${categories.length} offer categories`,
      data: {
        categories,
        pagination
      },
      timestamp: new Date().toISOString()
    };

  } catch (error: any) {
    let errorMessage = 'Unknown error';

    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Affise server';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timeout exceeded';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Affise server not found (DNS error)';
    } else if (error.response) {
      errorMessage = error.response.data?.message || error.message;
    } else {
      errorMessage = error.message;
    }

    return {
      status: 'error',
      message: `Error getting offer categories: ${errorMessage}`,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Quick analysis of offer categories
 */
export function analyzeOfferCategories(categories: OfferCategory[]): {
  total: number;
  titles: string[];
  mostRecent?: OfferCategory;
  oldestUpdate?: OfferCategory;
  hasStatus: boolean;
  statusCounts?: { [status: string]: number };
} {
  if (!categories?.length) {
    return {
      total: 0,
      titles: [],
      hasStatus: false
    };
  }

  const titles = categories.map(cat => cat.title).filter(Boolean);
  
  // Find most recent and oldest updates if timestamps exist
  const withUpdates = categories.filter(cat => cat.updated_at);
  const sorted = withUpdates.sort((a, b) => 
    new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime()
  );
  
  const mostRecent = sorted[0];
  const oldestUpdate = sorted[sorted.length - 1];
  
  // Analyze status if available
  const hasStatus = categories.some(cat => cat.status);
  let statusCounts: { [status: string]: number } | undefined;
  
  if (hasStatus) {
    statusCounts = categories.reduce((acc, cat) => {
      if (cat.status) {
        acc[cat.status] = (acc[cat.status] || 0) + 1;
      }
      return acc;
    }, {} as { [status: string]: number });
  }

  return {
    total: categories.length,
    titles,
    mostRecent,
    oldestUpdate,
    hasStatus,
    statusCounts
  };
}

/**
 * Search categories by title (case-insensitive)
 */
export function searchCategoriesByTitle(
  categories: OfferCategory[], 
  searchTerm: string
): OfferCategory[] {
  if (!searchTerm || !categories?.length) {
    return [];
  }
  
  const term = searchTerm.toLowerCase();
  return categories.filter(cat => 
    cat.title?.toLowerCase().includes(term)
  );
}

/**
 * Get categories by specific IDs
 */
export function getCategoriesByIds(
  categories: OfferCategory[], 
  ids: string[]
): OfferCategory[] {
  if (!ids?.length || !categories?.length) {
    return [];
  }
  
  return categories.filter(cat => ids.includes(cat.id));
}

/**
 * Export constants for easy reference
 */
export const OFFER_CATEGORIES_CONSTANTS = {
  MAX_LIMIT: 99999,
  DEFAULT_LIMIT: 99999,
  DEFAULT_PAGE: 1,
  DEFAULT_ORDER: 'id' as const,
  DEFAULT_ORDER_TYPE: 'asc' as const,
  AVAILABLE_ORDER_FIELDS: ['id', 'title'] as const,
  AVAILABLE_ORDER_TYPES: ['asc', 'desc'] as const
} as const;

/**
 * Validation helper for parameters
 */
export function validateOfferCategoriesParams(params: OfferCategoriesParams): {
  valid: boolean;
  errors: string[];
  sanitized: OfferCategoriesParams;
} {
  const errors: string[] = [];
  const sanitized: OfferCategoriesParams = { ...params };

  // Validate page
  if (params.page !== undefined) {
    if (!Number.isInteger(params.page) || params.page < 1) {
      errors.push('Page must be a positive integer');
    }
  }

  // Validate limit
  if (params.limit !== undefined) {
    if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > OFFER_CATEGORIES_CONSTANTS.MAX_LIMIT) {
      errors.push(`Limit must be between 1 and ${OFFER_CATEGORIES_CONSTANTS.MAX_LIMIT}`);
    }
  }

  // Validate orderType
  if (params.orderType && !OFFER_CATEGORIES_CONSTANTS.AVAILABLE_ORDER_TYPES.includes(params.orderType)) {
    errors.push(`orderType must be one of: ${OFFER_CATEGORIES_CONSTANTS.AVAILABLE_ORDER_TYPES.join(', ')}`);
    sanitized.orderType = OFFER_CATEGORIES_CONSTANTS.DEFAULT_ORDER_TYPE;
  }

  // Validate order
  if (params.order && !OFFER_CATEGORIES_CONSTANTS.AVAILABLE_ORDER_FIELDS.includes(params.order)) {
    errors.push(`order must be one of: ${OFFER_CATEGORIES_CONSTANTS.AVAILABLE_ORDER_FIELDS.join(', ')}`);
    sanitized.order = OFFER_CATEGORIES_CONSTANTS.DEFAULT_ORDER;
  }

  // Validate IDs format
  if (params.ids && Array.isArray(params.ids)) {
    const invalidIds = params.ids.filter(id => typeof id !== 'string' || id.trim() === '');
    if (invalidIds.length > 0) {
      errors.push('All IDs must be non-empty strings');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

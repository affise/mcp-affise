/**
 * Types and interfaces for the unified Affise offers search.
 *
 * Extracted from the original kitchen-sink unified_affise_offers.ts
 * (1433 LOC) so the search core, NLP, API, and analysis modules can
 * import types without dragging their implementations.
 */

import type { SmartPaginationResult } from './smart_pagination.js';
import type { AffisePayment, AffiseLanding } from '../types/api-responses.js';

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

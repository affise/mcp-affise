/**
 * Unified API Response Types
 * Single source of truth for all API responses
 */

// Base response interface for all API calls
export interface BaseApiResponse {
  status: 'ok' | 'error';
  message: string;
  timestamp: string;
}

// Affise Offer Data Types
export interface AffiseOffer {
  id: number;
  offer_id: string;
  advertiser: string; // ID string, not object
  external_offer_id: string;
  bundle_id: string;
  hide_payments: boolean;
  title: string;
  macro_url: string;
  url: string;
  parallel_tracking_url: string;
  url_preview: string;
  preview_url: string;
  domain_url: string;
  trafficback_url: string;
  cross_postback_url: string;
  cross_postback_method: string;
  cross_postback_body: string;
  use_https: boolean;
  use_http: boolean;
  description_lang: Record<string, string>;
  sources: Array<{
    id: string;
    title: string;
    allowed: number;
  }>;
  logo: string;
  logo_source: string;
  status: string;
  privacy: string; // 'public' | 'private'
  is_top: number; // 0 | 1
  payments: AffisePayment[];
  partner_payments: AffisePayment[];
  landings: AffiseLanding[];
  strictly_country: number;
  strictly_os: Record<string, unknown> | null;
  strictly_brands: unknown[];
  strictly_connection_type: string | null;
  restriction_isp: Array<{ name: string; country: string }> | null;
  is_redirect_overcap: boolean;
  is_impression_overcap: boolean;
  notice_percent_overcap: number;
  hold_period: number;
  hold_type: string;
  categories: string[];
  full_categories: Array<{
    id: string;
    title: string;
  }>;
  cr: number;
  epc: number;
  affiliate_epc: number;
  notes: string;
  allowed_ip: string;
  disallowed_ip: string;
  hash_password: string;
  allow_deeplink: boolean;
  hide_referer: boolean;
  start_at: string;
  stop_at: string;
  auto_offer_connect: number;
  required_approval: boolean;
  is_cpi: boolean;
  creatives: AffiseCreative[];
  creatives_zip: string | null;
  created_at: string;
  sub_accounts: Record<string, unknown> | unknown[];
  disabled_by: string;
  kpi: Record<string, string>;
  strictly_isp: unknown[];
  caps: Array<{
    goals: Record<string, unknown>;
    period: string;
    type: string;
    value: number;
    current_value: number;
    goal_type: string;
    affiliates: unknown[];
    affiliate_type: string;
    country_type: string;
    country: string | null;
    sub_number: number;
    sub_value: unknown[];
  }>;
  caps_status: string[];
  updated_at: string;
  caps_goal_overcap: string;
  targeting: Array<{
    country: { allow: string[]; deny: string[] };
    region: { allow: Record<string, unknown>; deny: Record<string, unknown> };
    city: { allow: Record<string, unknown>; deny: Record<string, unknown> };
    os: { allow: unknown[]; deny: unknown[] };
    isp: { allow: Record<string, unknown>; deny: Record<string, unknown> };
    ip: { allow: unknown[]; deny: unknown[] };
    browser: { allow: unknown[]; deny: unknown[] };
    brand: { allow: unknown[]; deny: unknown[] };
    device_type: string[];
    connection: string[];
    affiliate_id: unknown[];
    sub: {
      allow: Record<string, unknown>;
      deny: Record<string, unknown>;
      deny_groups: unknown[];
    };
    id: string;
    os_deny: boolean;
    zip: unknown[];
    device_type_deny: boolean;
    connection_deny: boolean;
    urls?: Array<{
      url: string;
      weight: number;
      spt_url: string | null;
    }>;
    macros_replacement: unknown[];
    macros_replacement_enabled: unknown[];
    browser_version: unknown[];
    device_model: Record<string, unknown> | unknown[];
    name: string;
    condition: string;
    enabled: boolean;
    isp_organization: unknown[];
    referrer: unknown[];
    ua: unknown[];
    block_proxy: boolean;
  }>;
  commission_tiers: Array<{
    id: string;
    affiliate_type: string;
    affiliates: number[];
    goals: unknown[];
    timeframe: string;
    type: string;
    value: number;
    target_goals: unknown[];
    modifier_type: string;
    modifier_value: number;
    countries: unknown[];
    conversion_status: string[];
    modifier_payment_type: string;
  }>;
  enabled_commission_tiers: boolean;
  consider_personal_targeting_only: boolean;
  hosts_only: boolean;
  duplicate_clicks_threshold: number;
  host_uniqueness_number_unique_clicks: number | null;
  host_uniqueness_time_frame: number | null;
  allow_impressions: boolean;
  impressions_url: string;
  smartlink_categories: string[];
  countries?: string[];
  strictly_devices?: string[];
  sub_restrictions?: Array<Record<string, string>>;
  uniq_ip_only: boolean;
  reject_not_uniq_ip: number;
  sign_clicks_integration: string;
  allow_duplicate_conversions: boolean;
  enable_impression_sub3_uniqueness: boolean;
  tags: string[];
}

export interface AffisePayment {
  countries: string[];
  cities: Array<{
    id: number;
    region_code: number;
    name: string;
    country_code: string;
    region: string;
  }> | unknown[];
  devices: string[];
  os: string[];
  goal: string;
  revenue: number;
  currency: string;
  title: string;
  type: string;
  country_exclude: boolean;
  id: string;
  total: number;
  with_regions: boolean;
  url: string | null;
  sub1: string[] | null;
  sub2: string[] | null;
  sub3: string[] | null;
  sub4: string[] | null;
  sub5: string[] | null;
  sub6: string[] | null;
  sub7: string[] | null;
  sub8: string[] | null;
  custom_field1: string[] | null;
  custom_field2: string[] | null;
  custom_field3: string[] | null;
  custom_field4: string[] | null;
  custom_field5: string[] | null;
  custom_field6: string[] | null;
  custom_field7: string[] | null;
  custom_field8: string[] | null;
  custom_field9: string[] | null;
  custom_field10: string[] | null;
  custom_field11: string[] | null;
  custom_field12: string[] | null;
  custom_field13: string[] | null;
  custom_field14: string[] | null;
  custom_field15: string[] | null;
  partners?: number[];
}

export interface AffiseLanding {
  id: number;
  title: string;
  url: string;
  url_preview: string;
  type: string;
}

export interface AffiseCreative {
  id: number;
  title: string;
  url: string;
  type: string;
  size: string;
  countries: string[];
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
  original: string;
  structured_filters: Record<string, unknown>;
  natural_language_parts: string[];
  confidence: number;
  suggestions?: string[];
}

// Cache information interface
export interface CacheInfo {
  was_cached?: boolean;
  cache_key?: string;
  query_complexity?: string;
  estimated_savings?: string;
  cache_recommendation?: string;
  used_cache?: boolean;
  cache_performance?: string;
}

// Search responses - Updated for unified system compatibility  
export interface OfferSearchResponse extends BaseApiResponse {
  offers?: OfferSummary[];
  total_found?: number;
  has_more_results?: boolean; // Added for pagination
  query_parsed?: unknown; // Parsed query information (varies by implementation)
  search_type?: 'natural_language' | 'structured' | 'hybrid'; // NEW: From unified system
  insights?: { // NEW: From unified system
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
  recommendations?: string[]; // NEW: From unified system
  cache_info?: CacheInfo;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Stats Data Types
export interface AffiseStats {
  id: string;
  date: string;
  offer_id: string;
  advertiser_id: string;
  affiliate_id: string;
  clicks: number;
  conversions: number;
  revenue: number;
  payout: number;
  profit: number;
  cr: number;
  epc: number;
  ctr: number;
  [key: string]: string | number; // Allow additional metrics
}

// Stats responses  
export interface StatsResponse extends BaseApiResponse {
  data?: {
    stats: AffiseStats[];
    totals?: Record<string, number>;
  };
  summary?: {
    total_records: number;
    key_metrics: Record<string, number>;
  };
  cache_info?: CacheInfo;
  suggestions?: string[];
}

// Smart search responses
export interface SmartSearchResponse extends BaseApiResponse {
  sample_data?: AffiseOffer | AffiseStats;
  has_more_results?: boolean;
  total_available?: number;
  search_params?: Record<string, unknown>;
  cache_info?: CacheInfo;
}

// Natural language query info
export interface QueryInfo {
  original: string;
  confidence: number;
  suggestions?: string[];
}

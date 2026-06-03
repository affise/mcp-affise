/**
 * Affise raw conversions tool — wraps `GET /3.0/stats/conversions`.
 *
 * Source contract: Affise API StatsRoute.php → clickHouseConversionAction.
 * Request form: Forms/Statistics/Clickhouse/Conversion.php.
 * Response mapper: App/GoApi/Mapper/Conversion.php.
 *
 * Unlike /3.0/stats/custom, this endpoint returns individual conversion
 * records (one row per event) with raw fields like ip / country / ua /
 * sub1..sub8 / click_time / status. Max limit 1000, max date range 365d
 * (63d in raw_export mode).
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';
import { compactTabular } from '../utils/compact-response.js';

// Affise accepts a numeric status code, but the UI / our model uses names.
// Mapping per ConversionEntity status constants (Affise API).
const STATUS_NAME_TO_CODE: Record<string, number> = {
  confirmed: 1,
  pending: 2,
  declined: 3,
  not_found: 4,
  hold: 5,
  banned: 6,
};

export type ConversionStatus =
  | 'confirmed' | 'pending' | 'declined' | 'not_found' | 'hold' | 'total';

export interface ConversionsParams {
  // === Required date window ===
  date_from: string;          // YYYY-MM-DD
  date_to: string;            // YYYY-MM-DD
  time_from?: string;         // HH:MM:SS
  time_to?: string;           // HH:MM:SS

  // === Status filter ===
  // Accepts names ("confirmed", "pending", ...). "total" → no filter (all statuses).
  status?: ConversionStatus[];

  // === Entity filters ===
  offer?: number[];
  partner?: string[];         // affiliate IDs (called `partner` in Filter.php)
  advertiser?: string[];
  supplier?: string[];
  goal?: string[];

  // === Geo / tech filters ===
  country?: string[];
  city?: string[];
  os?: string[];
  device?: string[];
  device_type?: string[];
  browser?: string[];

  // === Sub IDs (Filter.php caps at sub8 for filter, sub9..sub30 require
  // `enable_sub30` config; we expose sub1..sub8 only) ===
  sub1?: string[];
  sub2?: string[];
  sub3?: string[];
  sub4?: string[];
  sub5?: string[];
  sub6?: string[];
  sub7?: string[];
  sub8?: string[];

  // === Identifier filters ===
  action_id?: string;
  clickid?: string;
  promocode?: string;
  imp_id?: string;
  invoice_id?: string;
  user_id?: string;

  // === Tags ===
  offer_tag?: string;
  affiliate_tag?: string;
  advertiser_tag?: string;

  // === Payment / fraud ===
  payment_status?: string;
  payouts_from?: number;
  payouts_to?: number;
  fraud_risk_level?: string;
  fraud_type?: string[];
  decline_reason?: string;

  // === Pagination / sort ===
  page?: number;              // default 1
  limit?: number;             // max 1000
  order?: string;             // single field (no array per Conversion.php)
  sort?: 'asc' | 'desc';      // default desc

  // === Misc ===
  currency?: number;          // currency ID
  timezone?: string;
  shave?: 0 | 1;
  smart_id?: string;          // 'all_smartlinks' | 'direct_traffic' | numeric
  fields?: string;            // comma-separated column selector

  // === Raw export mode ===
  // When 1, bypasses the response mapper and returns unmapped ClickHouse rows.
  // Caps date range at 63 days.
  raw_export?: 0 | 1;
}

export interface AffiseConversionsResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  metadata?: {
    total_records: number;
    date_range: string;
    filters_applied: string[];
    page_info: {
      current_page: number;
      per_page: number;
      total_count?: number;
      total_pages?: number;
    };
    raw_export: boolean;
  };
  timestamp: string;
}

// Filter keys that are serialized as `filter[key][]=value` (arrays).
// Source: Conversion.php form definition.
const ARRAY_FILTERS = [
  'offer', 'partner', 'advertiser', 'supplier',
  'country', 'city', 'os', 'device', 'device_type', 'browser',
  'goal', 'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
  'fraud_type',
];

// Single-value filter keys → `filter[key]=value`.
const SCALAR_FILTERS = [
  'action_id', 'clickid', 'promocode', 'imp_id', 'invoice_id', 'user_id',
  'offer_tag', 'affiliate_tag', 'advertiser_tag',
  'payment_status', 'fraud_risk_level', 'decline_reason',
  'time_from', 'time_to', 'currency', 'timezone', 'smart_id',
];

export async function getAffiseConversions(
  config: { baseUrl: string; apiKey: string },
  params: ConversionsParams,
): Promise<AffiseConversionsResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
      timestamp: getCurrentTimestamp(),
    };
  }

  if (!params.date_from || !params.date_to) {
    return {
      status: 'error',
      message: 'date_from and date_to are required',
      timestamp: getCurrentTimestamp(),
    };
  }

  // Date range cap: 365 days normally, 63 days in raw_export mode.
  // Mirrors Affise API Conversion.php / ConversionsExportForm.php caps.
  const dateCapDays = params.raw_export ? 63 : 365;
  const fromDate = new Date(params.date_from);
  const toDate = new Date(params.date_to);
  if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > dateCapDays) {
      return {
        status: 'error',
        message: `Date range exceeds ${dateCapDays} days (Affise conversions limit${params.raw_export ? ', raw_export mode' : ''})`,
        timestamp: getCurrentTimestamp(),
      };
    }
  }

  try {
    const url = `${baseUrl}/3.0/stats/conversions`;
    const qp = new URLSearchParams();

    // NOTE: Unlike /3.0/stats/custom (Slice.php has a nested `filter` form),
    // /3.0/stats/conversions uses the Conversion form which expects fields at
    // ROOT level — sending `filter[...]` triggers
    // "Method does not allow extra fields: 'filter'" from the form binder.

    // Dates
    qp.append('date_from', params.date_from);
    qp.append('date_to', params.date_to);

    // Status: map names → ints. "total" means no filter.
    if (params.status?.length) {
      const codes = params.status
        .filter(s => s !== 'total')
        .map(s => STATUS_NAME_TO_CODE[s])
        .filter((c): c is number => Number.isFinite(c));
      codes.forEach(c => qp.append('status[]', String(c)));
    }

    // Array filters
    for (const key of ARRAY_FILTERS) {
      const values = (params as any)[key];
      if (Array.isArray(values) && values.length > 0) {
        values.forEach((v: any) => qp.append(`${key}[]`, String(v)));
      }
    }

    // Scalar filters
    for (const key of SCALAR_FILTERS) {
      const value = (params as any)[key];
      if (value !== undefined && value !== null && value !== '') {
        qp.append(key, String(value));
      }
    }

    // Numeric range filters
    if (params.payouts_from !== undefined) {
      qp.append('payouts_from', String(params.payouts_from));
    }
    if (params.payouts_to !== undefined) {
      qp.append('payouts_to', String(params.payouts_to));
    }

    // shave (0/1)
    if (params.shave !== undefined) {
      qp.append('shave', String(params.shave));
    }

    // Pagination & sort
    qp.append('page', String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 1000)));
    if (params.order) qp.append('order', params.order);
    if (params.sort) qp.append('orderType', params.sort);

    // Field selector (comma-separated)
    if (params.fields) qp.append('fields', params.fields);

    // Raw export bypasses the response mapper.
    if (params.raw_export) qp.append('raw_export', '1');

    const fullUrl = `${url}?${qp.toString()}`;
    if (process.env.NODE_ENV === 'development') {
      console.error('Conversions API URL:', fullUrl);
    }

    const response = await axios.get(fullUrl, {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 45000,
      validateStatus: status => status < 500,
    });

    if (response.status === 401) {
      return { status: 'error', message: 'Authentication failed - check API key', timestamp: getCurrentTimestamp() };
    }
    if (response.status === 403) {
      return { status: 'error', message: 'Access forbidden - insufficient permissions for conversions API', timestamp: getCurrentTimestamp() };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: `Conversions API returned error: ${response.status} ${response.statusText} - ${JSON.stringify(response.data)}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    const data = response.data;
    const conversions: any[] = Array.isArray(data?.conversions)
      ? data.conversions
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.stats)
          ? data.stats
          : Array.isArray(data) ? data : [];

    const pagination = data?.pagination || {};
    const totalCount = pagination.count ?? pagination.total ?? conversions.length;
    const totalPages = pagination.pages ?? pagination.total_pages;

    // Filters applied (best-effort summary for caller)
    const filtersApplied: string[] = [];
    if (params.status?.length) filtersApplied.push(`status: ${params.status.join(',')}`);
    if (params.partner?.length) filtersApplied.push(`partners: ${params.partner.length}`);
    if (params.offer?.length) filtersApplied.push(`offers: ${params.offer.length}`);
    if (params.country?.length) filtersApplied.push(`countries: ${params.country.join(',')}`);
    if (params.os?.length) filtersApplied.push(`OS: ${params.os.join(',')}`);
    if (params.device?.length) filtersApplied.push(`devices: ${params.device.join(',')}`);
    if (params.clickid) filtersApplied.push(`clickid: ${params.clickid}`);
    if (params.action_id) filtersApplied.push(`action_id: ${params.action_id}`);
    if (params.raw_export) filtersApplied.push('raw_export');

    // Compact tabular: flatten + drop empty cols, report dropped_columns.
    // Conversion records have ~100 fields, ~50% empty on real data → big win.
    const compactedData = compactTabular(data);

    return {
      status: 'ok',
      message: `Retrieved ${conversions.length} conversion records`,
      data: compactedData,
      metadata: {
        total_records: conversions.length,
        date_range: `${params.date_from} to ${params.date_to}`,
        filters_applied: filtersApplied,
        page_info: {
          current_page: params.page || 1,
          per_page: Math.min(params.limit || 100, 1000),
          total_count: totalCount,
          total_pages: totalPages,
        },
        raw_export: !!params.raw_export,
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    let errorMessage: string;
    if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise conversions server';
    else if (error.code === 'ETIMEDOUT') errorMessage = 'Conversions request timeout exceeded';
    else if (error.code === 'ENOTFOUND') errorMessage = 'Affise conversions server not found (DNS error)';
    else if (error.response) {
      const s = error.response.status;
      if (s === 401) errorMessage = 'Authentication failed - check API key';
      else if (s === 403) errorMessage = 'Access forbidden - insufficient permissions for conversions API';
      else if (s === 400) errorMessage = `Bad request - check parameters: ${error.response.data?.message || 'Invalid parameters'}`;
      else if (s === 429) errorMessage = 'Rate limit exceeded - too many requests';
      else errorMessage = error.response.data?.message || `HTTP ${s}: ${error.response.statusText}`;
    } else {
      errorMessage = error.message;
    }
    return {
      status: 'error',
      message: errorMessage,
      timestamp: getCurrentTimestamp(),
    };
  }
}

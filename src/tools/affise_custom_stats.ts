import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';
import { AffiseStatsPagination, SmartPaginationResult } from './smart_pagination.js';
import { compactTabular } from '../utils/compact-response.js';
import { normalizeStatsOrder, normalizeStatsFields } from '../utils/stats-normalizer.js';

// Slice values allowed by StatisticsEntity::getAllowedSliced(false).
// Generated sub1..sub30 union avoids 30 hand-written lines.
type SubSliceKey = `sub${1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30}`;

// Canonical source: Affise API
//   Validator:   src/Forms/Statistics/Clickhouse/Slice.php (NotBlank, multiple)
//   Whitelist:   src/App/Provider/Statistics/Clickhouse/StatisticsEntity::getAllowedSliced($isAdmin)
// Available to ALL roles (`getAllowedSliced(false)`); admin-only adds `advertiser` + `manager`.
type SliceType =
  // Time
  | 'year' | 'quarter' | 'month' | 'week' | 'day' | 'hour'
  // Offer / goal
  | 'offer' | 'goal'
  // Geo
  | 'country' | 'city'
  // OS
  | 'os' | 'os_version'
  // Device
  | 'device' | 'device_model' | 'device_type'
  // Browser
  | 'browser' | 'browser_version'
  // Landing pages
  | 'landing' | 'prelanding'
  // Network
  | 'isp' | 'conn_type'
  // Managers (NOT admin-only — both available to all roles per StatisticsEntity)
  | 'advertiser_manager_id' | 'affiliate_manager_id'
  // Partner-side
  | 'affiliate' | 'affiliate_id'
  // Other. Note: `trafficback_reason` is whitelisted but server rejects it
  // standalone with 400 — typically requires `filter[is_trafficback]=1` or
  // combination with `goal` slice.
  | 'smart_id' | 'trafficback_reason'
  // Sub IDs sub1..sub30 (whitelisted; filter is capped at sub1..sub8).
  // Note: some tenants return 500 for sub6..sub30 in slice — server-side
  // bug, not param validation. sub1..sub5 are reliable across tenants.
  | SubSliceKey
  // Admin-only (added on top of the above when `isAdmin === true`).
  | 'advertiser' | 'manager';

// Field options. Source: CustomStat::getGoApiFields() in Affise API.
// Base set is GOAPI_FIELDS; additional fields are gated on account feature flags.
type FieldType =
  // Base (GOAPI_FIELDS, always available — 13 values)
  | 'clicks' | 'hosts' | 'earnings' | 'income' | 'noincome' | 'payouts'
  | 'conversions' | 'cr' | 'affiliate_epc' | 'ratio' | 'epc'
  | 'trafficback' | 'afprice'
  // Gated on config.allow_impressions
  | 'ctr' | 'views' | 'ecpm'
  // Gated on config.enable_ad_costs
  | 'costs' | 'margin' | 'roi'
  // RESPONSE-ONLY: added by the controller when CPC/CPM access is granted and
  // `clicks` is in fields (or user role = Affiliate). NOT valid as request input
  // — /3.0/stats/custom validates input against getGoApiFields(), which excludes
  // them — so they are intentionally absent from STATS_RAW_FIELDS_ENUM. Kept in
  // this union only so response rows type-check.
  | 'clicks_earnings' | 'clicks_income';


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
  partner?: string[];                    // Partner/Affiliate IDs (canonical Filter.php key)
  affiliate?: string[];                  // Legacy alias for `partner` — auto-mapped in normalize
  affiliate_manager_id?: string[];       // Affiliate manager IDs
  supplier?: string[];                   // Advertiser-side supplier IDs
  offer?: number[];                     // Offer IDs (numeric only — validateOffer())
  smart_id?: string[];                  // SmartLink category IDs (requires config.smartlink)
  manager?: string[];                   // Manager IDs
  subaccount_id?: string[];             // Subaccount IDs (role/feature-gated)

  // Technical filters
  os?: string[];                        // Operating systems
  os_version?: string[];                // Operating system versions
  browser?: string[];                   // Browser types
  browser_version?: string[];           // Browser versions
  device?: string[];                    // Device types
  device_model?: string[];              // Device models
  conn_type?: string[];                 // Connection types
  isp?: string[];                       // ISP names

  // Campaign tracking filters — Filter.php only supports sub1..sub8.
  // sub9..sub30 are valid as slice/order but NOT as filter (known Filter.php limitation).
  sub1?: string[];
  sub2?: string[];
  sub3?: string[];
  sub4?: string[];
  sub5?: string[];
  sub6?: string[];
  sub7?: string[];
  sub8?: string[];

  // Page filters
  landing?: string[];                   // Landing page IDs
  prelanding?: string[];                // Pre-landing page IDs

  // Other filters
  currency?: string[];                  // Currency codes
  goal?: string[];                      // Goal names
  trafficback_reason?: string[];        // Traffic back reasons
  payment_status?: string[];            // Payment status filter
  nonzero?: 0 | 1;                     // Non-zero conversions only
  balance_type?: string;                // Requires isCPARevshareBalanceEnabled
  shave?: 0 | 1;                       // Requires isOptimisationToolsEnabled

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
  locale?: 'en' | 'ru' | 'es' | 'pt' | 'cn';  // Response language (Affise: ru/en/es/pt/cn)
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

  // Slice `trafficback_reason` is a special-case dimension that is only
  // compatible with the `trafficback` metric (conversion and traffic fields
  // are server-disabled per field-validator `createConversionRule` /
  // `createTrafficRule`). Without `fields: ['trafficback']`, Affise returns
  // a confusing 400 "bad request: rule trafficback_reason only work ...".
  // Catch this before the HTTP call with a precise error.
  if (params.slice.includes('trafficback_reason')) {
    const fields = params.fields ?? [];
    if (!fields.includes('trafficback') || fields.some(f => f !== 'trafficback')) {
      return {
        status: 'error',
        message:
          `slice 'trafficback_reason' is only compatible with fields=['trafficback']. ` +
          `Got fields=${JSON.stringify(fields)}. ` +
          `Remove other fields, or drop 'trafficback_reason' from slice to combine with conversion/traffic metrics.`,
        timestamp: getCurrentTimestamp(),
      };
    }
  }

  // Auto-resolve non-numeric partner clientIds → numeric affiliate_ids.
  // Affise stats filter[partner] only accepts numeric IDs. When the caller
  // passes a tracking name like "aff_demo", we hit /3.0/admin/partners?search=
  // and substitute. Pure-numeric values are passed through untouched (no HTTP).
  const partnerValues = (params as any).partner;
  if (Array.isArray(partnerValues) && partnerValues.some((v: any) => !/^\d+$/.test(String(v)))) {
    const { resolved, errors } = await resolvePartnerClientIds(config, partnerValues);
    if (errors.length) {
      return {
        status: 'error',
        message: errors.join(' | '),
        timestamp: getCurrentTimestamp(),
      };
    }
    (params as any).partner = resolved;
  }

  // Safety net for ID-typed filters.
  // Affise filter ID types:
  //   - partner / affiliate: numeric affiliate_id (sequential int) — already
  //     auto-resolved above
  //   - offer / offer_id: numeric (sequential int)
  //   - advertiser / supplier: 24-char MongoID hex string (NOT numeric)
  //
  // Validate shape per type, return a clear error instead of letting Affise
  // 400 with a cryptic "failed to decode query" message.
  const NUMERIC_FILTERS: Record<string, string> = {
    offer: 'affise_list_offers / affise_search_offers',
  };
  for (const [field, lookupTool] of Object.entries(NUMERIC_FILTERS)) {
    const values = (params as any)[field];
    if (Array.isArray(values) && values.length > 0) {
      const bad = values.filter((v: any) => !/^\d+$/.test(String(v)));
      if (bad.length) {
        return {
          status: 'error',
          message:
            `Affise stats filter[${field}] accepts numeric IDs only. ` +
            `Got non-numeric: ${bad.join(', ')}. ` +
            `Look up the numeric ID with ${lookupTool} first.`,
          timestamp: getCurrentTimestamp()
        };
      }
    }
  }

  // Auto-resolve non-MongoID advertiser/supplier names → MongoID strings.
  // Affise stats filter[advertiser|supplier] expects a 24-char hex MongoID
  // (e.g. "507f1f77bcf86cd799439011"). If caller passes a name or tag, hit
  // GET /3.0/admin/advertisers?name=... and substitute the MongoID.
  // Pure-MongoID values pass through untouched.
  for (const field of ['advertiser', 'supplier']) {
    const values = (params as any)[field];
    if (!Array.isArray(values) || values.length === 0) continue;
    const needsResolve = values.some((v: any) => !/^[a-f0-9]{24}$/i.test(String(v)));
    if (!needsResolve) continue;
    const { resolved, errors } = await resolveAdvertiserNames(config, values);
    if (errors.length) {
      return {
        status: 'error',
        message: errors.join(' | '),
        timestamp: getCurrentTimestamp(),
      };
    }
    (params as any)[field] = resolved;
  }

  try {
    const url = `${baseUrl}/3.0/stats/custom`;
    const queryParams = new URLSearchParams();

    // Add required parameters - slice arrays first
    params.slice.forEach(s => queryParams.append('slice[]', s));
    queryParams.append('filter[date_from]', params.date_from);
    queryParams.append('filter[date_to]', params.date_to);

    // Normalize fields[] — friendly aliases (`cost`, `charge`, `spend`, `revenue`,
    // `earning`, `impressions`) → canonical Affise names. Same mapping used by NL
    // parser; centralized in src/utils/stats-normalizer.ts so direct callers of
    // affise_stats_raw benefit too. `costs` (admin-only field) is intentionally
    // NOT remapped — direct callers may legitimately request it.
    if (params.fields?.length) {
      const { fields: normalizedFields, aliased } = normalizeStatsFields(params.fields);
      normalizedFields.forEach(f => queryParams.append('fields[]', f));
      if (aliased.length && process.env.NODE_ENV === 'development') {
        const summary = aliased.map(([from, to]) => `${from}→${to}`).join(', ');
        console.warn(`[stats] aliased fields: ${summary}`);
      }
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

    // Normalize order[] — friendly metric names (`earnings`, `conversions`, `cr`)
    // → canonical Affise sort keys (`confirmed_earning`, `total_count`, dropped).
    // Without this, presets and direct callers that use field-style names in
    // order[] get 403 "insufficient permissions" from Affise. See
    // src/utils/stats-normalizer.ts for the full mapping.
    if (params.order && Array.isArray(params.order) && params.order.length > 0) {
      const { order: normalizedOrder, dropped } = normalizeStatsOrder(params.order);
      normalizedOrder.forEach(o => queryParams.append('order[]', o));
      if (dropped.length && process.env.NODE_ENV === 'development') {
        console.warn(`[stats] dropped unsortable order entries: ${dropped.join(', ')}`);
      }
    }

    // Filter array-typed params per Filter.php form fields.
    // NOTE: sub1..sub8 only — Filter.php does not accept sub9..sub30 as filters
    // (those values are valid for slice/order but not filter).
    const arrayFilters = [
      // Geo & basics
      'country', 'city', 'currency', 'goal',
      // Entity
      'offer', 'smart_id',
      // Tech (only ones Filter.php accepts)
      'os', 'device',
      // Sides — `partner` is the canonical key; legacy `affiliate` aliased in normalize
      'supplier', 'advertiser', 'partner',
      // Managers
      'manager', 'advertiser_manager_id', 'affiliate_manager_id',
      // Sub IDs (Filter.php cap: sub1..sub8)
      'sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8',
      // Optional/conditional
      'payment_status', 'subaccount_id',
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

    if (params.balance_type) {
      queryParams.append('filter[balance_type]', params.balance_type);
    }

    if (params.shave !== undefined) {
      queryParams.append('filter[shave]', params.shave.toString());
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
      console.error('Custom Stats API URL:', fullUrl);
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
    if (params.partner?.length) filtersApplied.push(`partners: ${params.partner.length} items`);
    if (params.affiliate?.length) filtersApplied.push(`affiliates: ${params.affiliate.length} items`);  // legacy
    if (params.sub1?.length) filtersApplied.push(`sub1: ${params.sub1.length} items`);
    if (params.nonzero) filtersApplied.push('non-zero conversions only');
    if (params.timezone) filtersApplied.push(`timezone: ${params.timezone}`);

    const totalRecords = Array.isArray(data.stats) ? data.stats.length : 0;
    const pagination = data.pagination || {};

    // Slim the per-row `affiliate` entity to {id, login} before flattening.
    // The /stats/custom affiliate object ships id/title/email/login/name where
    // title/login/name are the same string — that's 3 redundant columns in the
    // partner-sliced grid. id + login is the useful identifier; callers who
    // need email/etc. drill down via affise_get_partner. Only `affiliate` is
    // touched — advertiser/offer entities keep their own label fields (an
    // advertiser has no `login`, so its title is the identifier).
    const slimAffiliate = (a: any) =>
      a && typeof a === 'object' && !Array.isArray(a)
        ? {
            ...(a.id !== undefined ? { id: a.id } : {}),
            ...(a.login !== undefined ? { login: a.login } : {}),
          }
        : a;
    // Drop the heavy, non-analytical fields from the per-row `offer` entity:
    // `url` and `logo` bloat every offer-sliced row and are useless for stats.
    // Keep id/title/offer_id/status (identifier + label + status). Callers who
    // need the URL or creative drill down via affise_get_offer.
    const OFFER_DROP = new Set(['url', 'logo']);
    const slimOffer = (o: any) =>
      o && typeof o === 'object' && !Array.isArray(o)
        ? Object.fromEntries(Object.entries(o).filter(([k]) => !OFFER_DROP.has(k)))
        : o;
    // Entities sit under `row.slice.<entity>` (compactTabular emits
    // `slice.<entity>.*`, so a display layer strips the `slice.` prefix).
    const stats = Array.isArray(data?.stats)
      ? data.stats.map((row: any) => {
          if (!row?.slice || typeof row.slice !== 'object') return row;
          const slice = { ...row.slice };
          if ('affiliate' in slice) slice.affiliate = slimAffiliate(slice.affiliate);
          if ('offer' in slice) slice.offer = slimOffer(slice.offer);
          return { ...row, slice };
        })
      : data?.stats;

    // Compact tabular form: flatten + drop empty cols, report drops.
    // Affise stats responses use { stats: [...] }, which compactTabular
    // detects and reshapes. Non-stats payloads pass through unchanged.
    const compactedData = compactTabular({ ...data, stats });

    return {
      status: 'ok',
      message: `Retrieved ${totalRecords} custom statistics records`,
      data: compactedData,
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
    let errorMessage: string;

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

/**
 * Resolve a list of partner clientIds (tracking names) to numeric affiliate_ids
 * by querying GET /3.0/admin/partners?search=<name>.
 *
 * - Pure-numeric values pass through untouched (no HTTP).
 * - Exactly-one match → use that id.
 * - Zero matches → error "partner not found: <name>".
 * - Multiple matches → error listing candidate ids so the caller can pick.
 *
 * Used by getAffiseCustomStats to make NL queries like "for partner aff_demo"
 * work transparently — caller doesn't need to do a separate lookup step.
 */
async function resolvePartnerClientIds(
  config: { baseUrl: string; apiKey: string },
  values: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const resolved: string[] = [];
  const errors: string[] = [];

  for (const raw of values) {
    const v = String(raw);
    if (/^\d+$/.test(v)) {
      resolved.push(v);
      continue;
    }
    try {
      const url = `${config.baseUrl}/3.0/admin/partners?search=${encodeURIComponent(v)}&limit=10`;
      const resp = await axios.get(url, {
        headers: { 'api-key': config.apiKey, 'Accept': 'application/json' },
        timeout: 10000,
        validateStatus: s => s < 500,
      });
      if (resp.status === 401 || resp.status === 403) {
        errors.push(`Cannot resolve partner "${v}": admin API key required for /3.0/admin/partners (got HTTP ${resp.status}).`);
        continue;
      }
      if (resp.status >= 400) {
        errors.push(`Partner lookup failed (HTTP ${resp.status}) for "${v}".`);
        continue;
      }
      const partners: any[] = Array.isArray(resp.data?.partners) ? resp.data.partners : [];
      if (partners.length === 0) {
        errors.push(`Partner not found: "${v}". Check the clientId / tracking name spelling.`);
      } else if (partners.length === 1) {
        const id = partners[0]?.id;
        if (id == null) {
          errors.push(`Partner lookup for "${v}" returned a record without an id.`);
        } else {
          resolved.push(String(id));
        }
      } else {
        const sample = partners.slice(0, 5).map((p: any) => {
          const label = p.title || p.login || p.email || p.name || '(no label)';
          return `id=${p.id} (${label})`;
        }).join(', ');
        errors.push(`Ambiguous partner "${v}": ${partners.length} matches — ${sample}. Pass the numeric id directly.`);
      }
    } catch (e: any) {
      errors.push(`Partner lookup error for "${v}": ${e?.message ?? String(e)}`);
    }
  }

  return { resolved, errors };
}

/**
 * Resolve a list of advertiser names / tags to 24-char hex MongoIDs by
 * querying GET /3.0/admin/advertisers?name=<name>.
 *
 * - Valid MongoIDs (24-char hex) pass through untouched (no HTTP).
 * - Exactly-one match → use that MongoID.
 * - Zero matches → error.
 * - Multiple matches → error listing candidate IDs so the caller can pick.
 *
 * Used by getAffiseCustomStats so NL/raw queries can pass advertiser names
 * transparently — caller doesn't need a separate lookup step.
 */
async function resolveAdvertiserNames(
  config: { baseUrl: string; apiKey: string },
  values: string[],
): Promise<{ resolved: string[]; errors: string[] }> {
  const resolved: string[] = [];
  const errors: string[] = [];

  for (const raw of values) {
    const v = String(raw);
    if (/^[a-f0-9]{24}$/i.test(v)) {
      resolved.push(v);
      continue;
    }
    try {
      const url = `${config.baseUrl}/3.0/admin/advertisers?name=${encodeURIComponent(v)}&limit=10`;
      const resp = await axios.get(url, {
        headers: { 'api-key': config.apiKey, 'Accept': 'application/json' },
        timeout: 10000,
        validateStatus: s => s < 500,
      });
      if (resp.status === 401 || resp.status === 403) {
        errors.push(`Cannot resolve advertiser "${v}": admin API key required for /3.0/admin/advertisers (got HTTP ${resp.status}).`);
        continue;
      }
      if (resp.status >= 400) {
        errors.push(`Advertiser lookup failed (HTTP ${resp.status}) for "${v}".`);
        continue;
      }
      const advertisers: any[] = Array.isArray(resp.data?.advertisers) ? resp.data.advertisers : [];
      if (advertisers.length === 0) {
        errors.push(`Advertiser not found: "${v}". Check the name spelling or pass the 24-char MongoID directly.`);
      } else if (advertisers.length === 1) {
        const id = advertisers[0]?.id;
        if (id == null) {
          errors.push(`Advertiser lookup for "${v}" returned a record without an id.`);
        } else {
          resolved.push(String(id));
        }
      } else {
        const sample = advertisers.slice(0, 5).map((a: any) => {
          const label = a.title || a.name || a.email || '(no label)';
          return `id=${a.id} (${label})`;
        }).join(', ');
        errors.push(`Ambiguous advertiser "${v}": ${advertisers.length} matches — ${sample}. Pass the MongoID directly.`);
      }
    } catch (e: any) {
      errors.push(`Advertiser lookup error for "${v}": ${e?.message ?? String(e)}`);
    }
  }

  return { resolved, errors };
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

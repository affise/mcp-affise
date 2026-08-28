import { validateFieldCombination, autoFixFieldCombination, normalizeFieldNames } from './field-validator.js';
import { METRIC_TO_ORDER_FIELD } from '../utils/stats-normalizer.js';

// Simple query interpretation
export interface SimpleQueryInfo {
  original: string;
  confidence: number;
  countries: string[];
  categories: string[];
  devices: string[];
  time_period?: string;
  date_from?: string;
  date_to?: string;
  metrics: string[];
  dimensions: string[];
  keywords: string[];
  suggestions: string[];
  // "top N" → limit; order_by carries the metric the user wants ranked (descending).
  // Populated by extractTopN(); consumed by toStatsParams().
  limit?: number;
  order_by?: string;
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

  // Explicit "from YYYY-MM-DD to YYYY-MM-DD" ranges take precedence over
  // named periods downstream (the affise_stats handler). A lone date is a
  // one-day range.
  const dateRange = extractExplicitDateRange(q) ?? extractSingleDate(q);

  // Metric patterns
  const metrics = extractMetrics(q);
  
  // Dimension patterns
  const dimensions = extractDimensions(q);

  // "top N <dim> by <metric>" → limit + order_by
  const top = extractTopN(q);

  // Extract remaining keywords
  const keywords = extractKeywords(q);
  
  // Calculate confidence based on matches
  let confidence = 0.3;
  if (countries.length > 0) confidence += 0.2;
  if (categories.length > 0) confidence += 0.25;
  if (devices.length > 0) confidence += 0.15;
  if (time_period || dateRange) confidence += 0.3;
  if (metrics.length > 0) confidence += 0.2;
  
  const suggestions = confidence < 0.7 ? generateSuggestions(q) : [];
  
  return {
    original: query,
    confidence: Math.min(confidence, 1.0),
    countries,
    categories,
    devices,
    time_period,
    date_from: dateRange?.date_from,
    date_to: dateRange?.date_to,
    metrics,
    dimensions,
    keywords,
    suggestions,
    limit: top?.limit,
    order_by: top?.order_by,
  };
}

// "from 2026-06-29 to 2026-07-05", "between 2026-06-29 and 2026-07-05",
// "2026-06-29 - 2026-07-05", bare "2026-06-29 to 2026-07-05".
// Reversed ranges are swapped, calendar-invalid dates are rejected
// (the pair is dropped and the caller falls back to named periods).
export function extractExplicitDateRange(
  query: string,
): { date_from: string; date_to: string } | undefined {
  return extractExplicitDateRanges(query)[0];
}

// Plural form: extract ALL explicit ISO ranges in one query, in text order,
// deduped. Calendar-invalid pairs are skipped (not fatal), reversed pairs are
// swapped. extractExplicitDateRange returns the first element for the common
// single-range case.
export function extractExplicitDateRanges(
  query: string,
): Array<{ date_from: string; date_to: string }> {
  const DATE = '(\\d{4}-\\d{2}-\\d{2})';
  const patterns = [
    new RegExp(`\\bfrom\\s+${DATE}\\s+(?:to|till|until|through)\\s+${DATE}\\b`, 'gi'),
    new RegExp(`\\bbetween\\s+${DATE}\\s+and\\s+${DATE}\\b`, 'gi'),
    new RegExp(`\\b${DATE}\\s*(?:to|till|until|through|[-–—])\\s*${DATE}\\b`, 'gi'),
  ];
  const seen = new Set<string>();
  const hits: Array<{ date_from: string; date_to: string; index: number }> = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) {
      if (!isValidCalendarDate(m[1]) || !isValidCalendarDate(m[2])) continue;
      const [date_from, date_to] = m[1] <= m[2] ? [m[1], m[2]] : [m[2], m[1]];
      const key = `${date_from}|${date_to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ date_from, date_to, index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index).map(({ date_from, date_to }) => ({ date_from, date_to }));
}

function isValidCalendarDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

const pad2 = (n: string) => n.padStart(2, '0');

// A single explicit date ("2026-07-28", "28.07.2026", "28/07/2026", "2026.07.28")
// resolves to a one-day range. Ambiguous D/M vs M/D pairs are read as
// day-first unless the second number rules that out (07/28/2026).
export function extractSingleDate(
  query: string,
): { date_from: string; date_to: string } | undefined {
  const asRange = (iso: string) =>
    isValidCalendarDate(iso) ? { date_from: iso, date_to: iso } : undefined;

  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(query);
  if (iso) return asRange(`${iso[1]}-${iso[2]}-${iso[3]}`);

  const ymd = /\b(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})\b/.exec(query);
  if (ymd) return asRange(`${ymd[1]}-${pad2(ymd[2])}-${pad2(ymd[3])}`);

  const pair = /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/.exec(query);
  if (pair) {
    const [, first, second, year] = pair;
    const [day, month] = Number(second) > 12 && Number(first) <= 12
      ? [second, first]
      : [first, second];
    return asRange(`${year}-${pad2(month)}-${pad2(day)}`);
  }

  return undefined;
}

const MONTH_NAMES = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
const DATE_LIKE_TOKEN = new RegExp(
  `\\b(?:\\d{1,4}[.\\/-]\\d{1,2}(?:[.\\/-]\\d{1,4})?` +
  `|\\d{1,2}\\s+(?:${MONTH_NAMES})[a-z]*` +
  `|(?:${MONTH_NAMES})[a-z]*\\s+\\d{1,2})\\b`,
  'i',
);

// Reports a date-looking token so callers can reject an unparseable date
// instead of silently substituting a default period.
export function findDateLikeToken(query: string): string | undefined {
  return DATE_LIKE_TOKEN.exec(query)?.[0];
}

// "top 10 offers by charge" → { limit: 10, order_by: 'costs' }
// "top 25 affiliates" → { limit: 25 }   (no order_by — caller picks default)
// order_by is canonicalized (charge → costs, revenue → income) so it matches
// what Affise expects in `fields[]` / `order[]`.
function extractTopN(query: string): { limit?: number; order_by?: string } | undefined {
  const m = query.match(/\btop\s+(\d+)\b(?:\s+[a-z_]+s?)?(?:\s+by\s+([a-z_]+))?/i);
  if (!m) return undefined;
  const limit = Number(m[1]);
  if (!Number.isFinite(limit) || limit <= 0) return undefined;
  const rawMetric = m[2]?.toLowerCase();
  if (!rawMetric) return { limit };
  // Reuse metric-name canonicalization. extractMetrics returns the canonical
  // form for `charge` → `costs`, `revenue` → `income`, etc. — we run it on
  // the bare metric word so order_by aligns with the fields we'd request.
  const canonical = extractMetrics(rawMetric);
  return { limit, order_by: canonical[0] ?? rawMetric };
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
    // "cost" / "charge" / "spend" — client slang for the revenue flowing in.
    // The Affise field whitelist available to most tenants is:
    //   clicks, hosts, earnings, income, noincome, payouts, conversions, cr,
    //   affiliate_epc, ratio, epc, trafficback, (impressions extras: ctr, views, ecpm).
    // `costs` is an admin-only extra — most clients won't have it. Map all
    // cost-synonyms to `income` (universally available, same number from the
    // partner's POV). For the admin `costs` field, use affise_stats_raw with
    // explicit fields=['costs'].
    'charge': 'income',
    'costs': 'income',
    'cost': 'income',
    'spend': 'income',
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
    'by goal': 'goal',
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

  // Multi-dimensional "by X and Y", "by X, Y, Z", "by X Y Z" — the simple
  // dimensionMap above only catches the FIRST `by <single>`. Here we walk
  // every `by …` group and collect each known token (incl. sub1..sub30).
  // Stops at a clause boundary (time/filter/limit/order keyword or EOL).
  const DIM_ALIAS: Record<string, string> = {
    day: 'day', daily: 'day', hour: 'hour', hourly: 'hour',
    month: 'month', monthly: 'month',
    country: 'country', offer: 'offer', offers: 'offer',
    affiliate: 'affiliate', affiliates: 'affiliate',
    partner: 'affiliate', partners: 'affiliate',
    publisher: 'affiliate', publishers: 'affiliate', pub: 'affiliate',
    device: 'device', os: 'os', browser: 'browser',
    advertiser: 'advertiser', advertisers: 'advertiser',
    smartlink: 'smart_id', smart_id: 'smart_id',
    goal: 'goal', goals: 'goal',
  };
  const STOP_WORDS = /\b(?:last|this|yesterday|today|next|past|for|with|filter|where|limit|order|top|in)\b/i;
  const byGroupRegex = /\b(?:by|breakdown\s+by)\s+([a-z][a-z0-9_,\s/+]*?)(?=\s+(?:last|this|yesterday|today|next|past|for|with|filter|where|limit|order|top|in)\b|$)/gi;
  let byMatch: RegExpExecArray | null;
  while ((byMatch = byGroupRegex.exec(query)) !== null) {
    const tail = byMatch[1].trim();
    // Tokenize on , and / and + and "and"/"or" and whitespace
    const tokens = tail
      .replace(/\b(?:and|or)\b/gi, ',')
      .split(/[\s,/+]+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t && !STOP_WORDS.test(t));
    for (const tok of tokens) {
      // Canonical alias?
      const canon = DIM_ALIAS[tok];
      if (canon) {
        if (!found.includes(canon)) found.push(canon);
        continue;
      }
      // sub1..sub30?
      const subM = tok.match(/^sub(\d+)$/);
      if (subM) {
        const n = Number(subM[1]);
        if (n >= 1 && n <= 30) {
          const key = `sub${n}`;
          if (!found.includes(key)) found.push(key);
        }
      }
      // Unknown token — silently skip (don't pollute slice with junk)
    }
  }

  // "dynamics" / "over time" / "trend" / "trends" — user is asking for a
  // time series. Make sure `day` is in the slice (it's a no-op if already
  // present via "by day" or "daily").
  if (/\b(?:dynamics|over\s+time|trend|trends|timeline)\b/i.test(query)) {
    if (!found.includes('day') && !found.includes('hour') && !found.includes('month')) {
      // Unshift so day comes first in slice — Affise convention for time series
      found.unshift('day');
    }
  }

  // Sub-ID dimensions. Affise accepts sub1..sub30 as slice values (filter is
  // capped at sub8 per Filter.php; slice/order have no cap).
  //
  // The marker prefix is REQUIRED so we don't catch bare `sub5` from
  // key=value filter forms ("os=Unknown sub5=abc") — those are handled by
  // extractFilters(), not here.
  //
  // Recognized forms:
  //   "by subN"              | "by sub5"
  //   "breakdown by subN"    | "breakdown by sub3"
  //   "top N by subM"        | "top 10 by sub5"
  //   "top N subM"           | "top 10 sub5"
  const subDimRegex = /(?:\bby\s+|\bbreakdown\s+by\s+|\btop\s+\d+\s+(?:by\s+)?)sub(\d+)\b/gi;
  let subMatch: RegExpExecArray | null;
  let foundAnySubDim = false;
  while ((subMatch = subDimRegex.exec(query)) !== null) {
    const n = Number(subMatch[1]);
    if (n >= 1 && n <= 30) {
      const key = `sub${n}`;
      if (!found.includes(key)) found.push(key);
      foundAnySubDim = true;
    }
  }

  // If at least one sub-dim was found via a marker, also pick up sibling
  // sub-IDs joined by conjunctions ("breakdown by sub1 and sub5"). Negative
  // lookahead for `:` / `=` keeps us from catching filter-form values.
  if (foundAnySubDim) {
    const conjRegex = /(?:\band\s+|\bor\s+|,\s*)sub(\d+)\b(?!\s*[:=])/gi;
    let conjMatch: RegExpExecArray | null;
    while ((conjMatch = conjRegex.exec(query)) !== null) {
      const n = Number(conjMatch[1]);
      if (n >= 1 && n <= 30) {
        const key = `sub${n}`;
        if (!found.includes(key)) found.push(key);
      }
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

// Extract structured filter conditions from NL query.
// Supports both `key=value` / `key: value` forms and a few prose forms.
// Receives the ORIGINAL (mixed-case) query so filter values keep their case.
export function extractFilters(query: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  // 1. key=value / key: value
  //    affiliate=193 (legacy → partner) | partner=193 | os=Unknown | sub1..sub8=abc
  const kvRegex = /\b(affiliate|partner|advertiser|supplier|offer|country|city|os|device|goal|smart_id|sub[1-8])\s*[:=]\s*([^\s,;]+(?:\s*,\s*[^\s,;]+)*)/gi;
  let m: RegExpExecArray | null;
  while ((m = kvRegex.exec(query)) !== null) {
    let key = m[1].toLowerCase();
    if (key === 'affiliate') key = 'partner'; // Filter.php uses `partner`
    const values = m[2].split(',').map(v => v.trim()).filter(Boolean);
    if (values.length) out[key] = [...(out[key] ?? []), ...values];
  }

  // 2. "for affiliate 193" / "partner id 193" prose → partner
  const affMatch = query.match(/\b(?:affiliate|partner)(?:\s+id)?\s+(\d+(?:\s*,\s*\d+)*)/i);
  if (affMatch && !out.partner) {
    out.partner = affMatch[1].split(',').map(s => s.trim());
  }

  // 2b. Identifier-like partner names: "for affiliate aff_demo", "partner client_abc",
  // "partner abc-123". Requires the value to contain at least one underscore,
  // hyphen, or digit — pure English words ("offers", "manager", "names") are
  // skipped to avoid false positives from queries like "show partner offers".
  // ALSO exclude sub<N> tokens — those are slice dimensions, not partner names
  // (e.g. "by affiliate sub1 os" must not capture "sub1" as a partner clientId).
  // The captured value is a tracking-name / clientId; getAffiseCustomStats
  // auto-resolves it to the numeric affiliate_id via /3.0/admin/partners?search=.
  if (!out.partner) {
    const nameMatch = query.match(/\b(?:for\s+)?(?:affiliate|partner)(?:\s+id)?\s+([a-zA-Z][a-zA-Z0-9_-]*(?:\s*,\s*[a-zA-Z][a-zA-Z0-9_-]*)*)/i);
    if (nameMatch) {
      const values = nameMatch[1]
        .split(',')
        .map(s => s.trim())
        .filter(v => /[_\-\d]/.test(v) && !/^sub\d+$/i.test(v));
      if (values.length) out.partner = values;
    }
  }

  // 3. "offer 12345" prose
  const offMatch = query.match(/\boffer(?:\s+id)?\s+(\d+(?:\s*,\s*\d+)*)/i);
  if (offMatch && !out.offer) {
    out.offer = offMatch[1].split(',').map(s => s.trim());
  }

  return out;
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
 * Convert parsed query to stats parameters with field validation.
 * Note: `order[]` canonicalization uses METRIC_TO_ORDER_FIELD from
 * src/utils/stats-normalizer.ts (single source of truth shared with
 * direct `affise_stats_raw` callers and `createCustomStatsPresets()`).
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
  // Slice-aware defaults: `goal` and `trafficback_reason` are MUTUALLY
  // EXCLUSIVE with `clicks` per field-validator rules. If we kept the
  // broad default (`clicks` included), auto-fix would drop the slice.
  // Use conversion-side metrics that ARE compatible with both slices.
  let fields: string[];
  if (parsed.metrics.length > 0) {
    fields = parsed.metrics;
  } else if (params.slice.includes('goal') || params.slice.includes('trafficback_reason')) {
    fields = ['conversions', 'income', 'cr'];
  } else {
    fields = ['clicks', 'conversions', 'income', 'cr']; // Default
  }
  
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

  // Extract structured filters (affiliate=193, os=Unknown, sub1..sub8=*) from
  // the ORIGINAL query so values like "Unknown" keep their casing.
  const extracted = extractFilters(parsed.original);
  for (const [k, v] of Object.entries(extracted)) {
    if (v && v.length && !params[k]) params[k] = v;
  }

  // Explicit dates win over named periods; period stays for callers that
  // resolve it themselves (the affise_stats handler).
  if (parsed.date_from && parsed.date_to) {
    params.date_from = parsed.date_from;
    params.date_to = parsed.date_to;
  } else if (parsed.time_period) {
    params.period = parsed.time_period;
  } else {
    params.period = 'last7days'; // Default
  }

  // "top N" → propagate limit; "top N by <metric>" → order descending by
  // that metric. Affise `order[]` vocabulary differs from `fields[]`, so we
  // canonicalize via METRIC_TO_ORDER_FIELD; unmappable metrics (epc, cr —
  // computed) drop `order[]` silently and keep just limit + field.
  // Direction goes in `orderType` — DO NOT prefix order values with "-".
  if (parsed.limit && parsed.limit > 0) {
    params.limit = parsed.limit;
  }
  if (parsed.order_by) {
    const orderField = METRIC_TO_ORDER_FIELD[parsed.order_by];
    if (orderField) {
      params.order = [orderField];
      params.orderType = 'desc';
    }
    // Always keep the requested metric in fields — user wants to see that column.
    if (Array.isArray(params.fields) && !params.fields.includes(parsed.order_by)) {
      params.fields = [...params.fields, parsed.order_by];
    }
  }

  return params;
}

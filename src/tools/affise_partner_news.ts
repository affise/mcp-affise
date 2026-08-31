/**
 * Affise partner news — wraps `GET /3.0/news`.
 *
 * Source: Affise API NewsRoute → NewsController::newsAction.
 * Requires ROLE_PARTNER. Returns platform announcements visible to the partner.
 *
 * Pagination uses skip/limit (NOT page/limit). Pass `fixed=true` to get only
 * pinned items, `fixed=false` to exclude pinned (default returns mixed list).
 *
 * Response: { status: 1, items: [{ _id, title, small_desc, desc, created_at, fixed, ... }], all_items: <total> }
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface PartnerNewsParams {
  limit?: number;        // server default per News::LIMIT
  skip?: number;         // offset; default 0
  fixed?: boolean;       // true → only pinned; false/omit → all
  // DEFAULT TRUE. Recursively walks the response and replaces any
  // embedded base64 image data URL with a `[IMAGE]` marker. News bodies
  // routinely include 50-200 KB base64 blobs per image — stripping is
  // the difference between a multi-MB and a sane-sized response.
  // Pass `false` explicitly to keep raw image bytes.
  strip_images?: boolean;
}

export interface PartnerNewsResult {
  status: 'ok' | 'error';
  message: string;
  data?: { items: any[]; all_items?: number };
  metadata?: { total: number; skip: number; per_page: number };
  timestamp: string;
}

export async function listPartnerNews(
  config: { baseUrl: string; apiKey: string },
  params: PartnerNewsParams = {},
): Promise<PartnerNewsResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  try {
    const qp = new URLSearchParams();
    if (params.limit !== undefined) qp.append('limit', String(params.limit));
    if (params.skip !== undefined)  qp.append('skip', String(params.skip));
    if (params.fixed === true)      qp.append('fixed', '1');

    const url = qp.toString()
      ? `${baseUrl}/3.0/news?${qp.toString()}`
      : `${baseUrl}/3.0/news`;

    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 15000,
      validateStatus: status => status < 500,
    });

    if (response.status === 401) {
      return { status: 'error', message: 'Authentication failed - check API key', timestamp: getCurrentTimestamp() };
    }
    if (response.status === 403) {
      return {
        status: 'error',
        message: 'Partner (affiliate) API key required for /3.0/news - admin keys are denied',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status === 404) {
      // Backend throws 404 when no news at all — surface as empty list, not error.
      return {
        status: 'ok',
        message: 'No news available',
        data: { items: [], all_items: 0 },
        metadata: { total: 0, skip: params.skip ?? 0, per_page: params.limit ?? 0 },
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.message || response.data?.error
          || `News API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    const data = response.data;
    let items: any[] = Array.isArray(data?.items) ? data.items : [];
    const allItems: number = typeof data?.all_items === 'number' ? data.all_items : items.length;

    // Default ON: only skip stripping if caller explicitly passes false.
    if (params.strip_images !== false && items.length) {
      items = items.map(item => stripBase64Images(item));
    }

    return {
      status: 'ok',
      message: `Retrieved ${items.length} of ${allItems} news items`,
      data: { items, all_items: allItems },
      metadata: {
        total: allItems,
        skip: params.skip ?? 0,
        per_page: params.limit ?? items.length,
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'News');
  }
}

// Recursively replace base64 image data URLs anywhere in the value tree.
// Matches the data URL with its base64 payload — works whether the URL is
// inside an <img src="..."> attribute, raw in a JSON string, or nested in
// per-locale fields like `desc_lang.en`.
const BASE64_IMAGE_RE = /data:image\/[a-zA-Z+.\-]+;base64,[A-Za-z0-9+/=]+/g;

export function stripBase64Images(value: any): any {
  if (typeof value === 'string') {
    return value.replace(BASE64_IMAGE_RE, '[IMAGE]');
  }
  if (Array.isArray(value)) {
    return value.map(stripBase64Images);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const k of Object.keys(value)) {
      out[k] = stripBase64Images((value as any)[k]);
    }
    return out;
  }
  return value;
}

function mapNetworkError(error: any, label: string) {
  let errorMessage: string;
  if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise server';
  else if (error.code === 'ETIMEDOUT') errorMessage = `${label} request timeout exceeded`;
  else if (error.code === 'ENOTFOUND') errorMessage = "Affise URL not found — check for typos and that it's your tenant's public API URL";
  else if (error.response) {
    const s = error.response.status;
    const apiErr = error.response.data?.message || error.response.data?.error;
    if (s === 401) errorMessage = 'Authentication failed - check API key';
    else if (s === 403) errorMessage = apiErr || 'Partner API key required';
    else if (s === 404) errorMessage = apiErr || 'Not found';
    else if (s === 429) errorMessage = 'Rate limit exceeded';
    else errorMessage = apiErr || `HTTP ${s}: ${error.response.statusText}`;
  } else {
    errorMessage = error.message;
  }
  return { status: 'error' as const, message: errorMessage, timestamp: getCurrentTimestamp() };
}

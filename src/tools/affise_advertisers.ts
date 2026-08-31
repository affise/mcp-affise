/**
 * Affise advertisers (suppliers) lookup tools.
 *
 *  - listAdvertisers → GET /3.0/admin/advertisers — paginated list with filters.
 *  - getAdvertiser   → GET /3.0/admin/advertiser/{id} — single advertiser detail.
 *
 * Source contracts: Affise API SuppliersRoute.php
 * (suppliersAction / supplierAction). Require IS_AUTHENTICATED_FULLY.
 *
 * Advertiser ID is a MongoId STRING (e.g. "507f1f77bcf86cd799439011"), unlike
 * offer / partner IDs which are integers — handle accordingly in the schema.
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';
import { compactTabular, redactKeys } from '../utils/compact-response.js';

const MONGO_ID_RE = /^[a-f0-9]{24}$/i;
const ALLOWED_ORDER = new Set(['id', 'email', 'title', 'created_at', 'updated_at']);

export interface ListAdvertisersParams {
  id?: string;
  name?: string;
  tags?: string;
  updated_at?: string;          // YYYY-MM-DD
  with_offers?: boolean;
  page?: number;
  limit?: number;
  order?: 'id' | 'email' | 'title' | 'created_at' | 'updated_at';
  orderType?: 'asc' | 'desc';
}

export interface AdvertisersListResult {
  status: 'ok' | 'error';
  message: string;
  data?: { advertisers: any[]; pagination?: any };
  metadata?: { total_count?: number; page: number; per_page: number };
  timestamp: string;
}

export async function listAdvertisers(
  config: { baseUrl: string; apiKey: string },
  params: ListAdvertisersParams = {},
): Promise<AdvertisersListResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  if (params.order && !ALLOWED_ORDER.has(params.order)) {
    return {
      status: 'error',
      message: `order must be one of: ${[...ALLOWED_ORDER].join(', ')}`,
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const qp = new URLSearchParams();
    if (params.id)         qp.append('id', String(params.id));
    if (params.name)       qp.append('name', params.name);
    if (params.tags)       qp.append('tags', params.tags);
    if (params.updated_at) qp.append('updated_at', params.updated_at);
    if (params.with_offers) qp.append('with_offers', '1');

    qp.append('page',  String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 500)));
    if (params.order)     qp.append('order', params.order);
    if (params.orderType) qp.append('orderType', params.orderType);

    const url = `${baseUrl}/3.0/admin/advertisers?${qp.toString()}`;

    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 20000,
      validateStatus: status => status < 500,
    });

    const mapped = mapHttpStatusToError(response, 'advertisers list');
    if (mapped) return mapped;

    const data = response.data;
    const advertisers: any[] = Array.isArray(data?.advertisers) ? data.advertisers : [];
    const pagination = data?.pagination || {};

    // Strip secrets + heavy/low-value fields before flattening — advertisers
    // (and nested manager) carry `api_key`, which must never reach the model
    // context. Mirrors the list_partners sanitisation.
    const sanitized = redactKeys(advertisers, [
      'api_key', 'customFields', 'payment_systems',
      'notes', 'tipalti_idap', 'avatar', 'skype', 'roles',
    ]);
    // Compact tabular: flatten + drop empty columns + report drops.
    // compactTabular detects {data: [...]} + pagination shape.
    const compactedData = compactTabular({ data: sanitized, pagination });

    return {
      status: 'ok',
      message: `Retrieved ${advertisers.length} advertisers`,
      data: compactedData,
      metadata: {
        total_count: pagination.total_count,
        page: pagination.page ?? (params.page || 1),
        per_page: pagination.per_page ?? Math.min(params.limit || 100, 500),
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Advertisers list');
  }
}

export interface GetAdvertiserParams {
  advertiser_id: string;        // MongoId 24-char hex
}

export interface GetAdvertiserResult {
  status: 'ok' | 'error';
  message: string;
  data?: { advertiser: any };
  timestamp: string;
}

export async function getAdvertiser(
  config: { baseUrl: string; apiKey: string },
  params: GetAdvertiserParams,
): Promise<GetAdvertiserResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (typeof params.advertiser_id !== 'string' || !MONGO_ID_RE.test(params.advertiser_id)) {
    return {
      status: 'error',
      message: 'advertiser_id is required and must be a 24-character hex MongoId',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const url = `${baseUrl}/3.0/admin/advertiser/${params.advertiser_id}`;
    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 15000,
      validateStatus: status => status < 500,
    });

    const mapped = mapHttpStatusToError(response, 'advertiser detail', { notFoundMsg: 'Advertiser not found' });
    if (mapped) return mapped;

    // BaseController::resultSuccess emits numeric `status: 1` — entity-key
    // presence is the success signal, not the string "success".
    const data = response.data;
    if (!data?.advertiser) {
      return {
        status: 'error',
        message: data?.error || 'Unexpected response shape from advertiser detail endpoint',
        timestamp: getCurrentTimestamp(),
      };
    }
    return {
      status: 'ok',
      message: `Advertiser ${params.advertiser_id} retrieved`,
      data: { advertiser: data.advertiser },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Advertiser detail');
  }
}

// === shared helpers ===

function mapHttpStatusToError(
  response: any,
  contextLabel: string,
  opts: { notFoundMsg?: string } = {},
):
  | { status: 'error'; message: string; timestamp: string }
  | undefined {
  if (response.status === 401) {
    return { status: 'error', message: 'Authentication failed - check API key', timestamp: getCurrentTimestamp() };
  }
  if (response.status === 403) {
    return {
      status: 'error',
      message: response.data?.error || 'Access denied',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (response.status === 404) {
    return {
      status: 'error',
      message: response.data?.error || opts.notFoundMsg || 'Not found',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (response.status >= 400) {
    return {
      status: 'error',
      message: response.data?.error || `${contextLabel} API error: ${response.status} ${response.statusText}`,
      timestamp: getCurrentTimestamp(),
    };
  }
  return undefined;
}

function mapNetworkError(error: any, label: string) {
  let errorMessage: string;
  if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise server';
  else if (error.code === 'ETIMEDOUT') errorMessage = `${label} request timeout exceeded`;
  else if (error.code === 'ENOTFOUND') errorMessage = "Affise URL not found — check for typos and that it's your tenant's public API URL";
  else if (error.response) {
    const s = error.response.status;
    const apiErr = error.response.data?.error;
    if (s === 401) errorMessage = 'Authentication failed - check API key';
    else if (s === 403) errorMessage = apiErr || 'Access denied';
    else if (s === 404) errorMessage = apiErr || 'Not found';
    else if (s === 400) errorMessage = apiErr || `Bad request: ${error.response.data?.message || 'Invalid parameters'}`;
    else if (s === 429) errorMessage = 'Rate limit exceeded';
    else errorMessage = apiErr || `HTTP ${s}: ${error.response.statusText}`;
  } else {
    errorMessage = error.message;
  }
  return { status: 'error' as const, message: errorMessage, timestamp: getCurrentTimestamp() };
}

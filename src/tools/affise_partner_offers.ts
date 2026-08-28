/**
 * Affise partner offers tools.
 *
 *  - listPartnerOffers     → GET /3.0/partner/offers      (offers AVAILABLE to the partner)
 *  - listPartnerLiveOffers → GET /3.0/partner/live-offers (offers the partner is RUNNING)
 *
 * Source: Affise API OffersRoute → OffersController::partnerOffersAction
 *                                  / OffersController::liveOffersAction
 * Both require ROLE_PARTNER and share the FilterForm — same supported params,
 * different backend logic for which offers they return.
 *
 * Response: { status: 1, offers: [...], pagination: {...} }
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface PartnerOffersParams {
  search?: string;                  // 'q' query param server-side
  countries?: string[];             // ISO codes
  categories?: string[];            // category IDs
  int_id?: number[];                // specific offer IDs
  privacy?: string[];
  updated_at?: string;              // YYYY-MM-DD
  from?: string;                    // YYYY-MM-DD
  to?: string;                      // YYYY-MM-DD
  caps_type?: string;
  caps_country?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface PartnerOffersResult {
  status: 'ok' | 'error';
  message: string;
  data?: { offers: any[]; pagination?: any };
  metadata?: { total_count?: number; page: number; per_page: number };
  timestamp: string;
}

export async function listPartnerOffers(
  config: { baseUrl: string; apiKey: string },
  params: PartnerOffersParams = {},
): Promise<PartnerOffersResult> {
  return fetchPartnerOffers(config, params, '/3.0/partner/offers', 'available offers');
}

export async function listPartnerLiveOffers(
  config: { baseUrl: string; apiKey: string },
  params: PartnerOffersParams = {},
): Promise<PartnerOffersResult> {
  return fetchPartnerOffers(config, params, '/3.0/partner/live-offers', 'live offers');
}

async function fetchPartnerOffers(
  config: { baseUrl: string; apiKey: string },
  params: PartnerOffersParams,
  path: string,
  label: string,
): Promise<PartnerOffersResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  try {
    const qp = new URLSearchParams();
    if (params.search)     qp.append('q', params.search);
    if (params.updated_at) qp.append('updated_at', params.updated_at);
    if (params.from)       qp.append('from', params.from);
    if (params.to)         qp.append('to', params.to);
    if (params.caps_type)    qp.append('caps_type', params.caps_type);
    if (params.caps_country) qp.append('caps_country', params.caps_country);
    if (params.sort)       qp.append('sort', params.sort);

    if (Array.isArray(params.countries))  params.countries.forEach(v => qp.append('countries[]', v));
    if (Array.isArray(params.categories)) params.categories.forEach(v => qp.append('categories[]', v));
    if (Array.isArray(params.privacy))    params.privacy.forEach(v => qp.append('privacy[]', v));
    if (Array.isArray(params.int_id))     params.int_id.forEach(v => qp.append('int_id[]', String(v)));

    qp.append('page',  String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 500)));

    const url = `${baseUrl}${path}?${qp.toString()}`;

    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 20000,
      validateStatus: status => status < 500,
    });

    const mapped = mapHttpStatusToError(response, label);
    if (mapped) return mapped;

    const data = response.data;
    const offers: any[] = Array.isArray(data?.offers) ? data.offers : [];
    const pagination = data?.pagination || {};

    return {
      status: 'ok',
      message: `Retrieved ${offers.length} ${label}`,
      data: { offers, pagination },
      metadata: {
        total_count: pagination.total_count ?? pagination.count,
        page: pagination.page ?? pagination.current_page ?? (params.page || 1),
        per_page: pagination.per_page ?? Math.min(params.limit || 100, 500),
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, label);
  }
}

// === shared helpers ===

function mapHttpStatusToError(
  response: any,
  label: string,
):
  | { status: 'error'; message: string; timestamp: string }
  | undefined {
  if (response.status === 401) {
    return { status: 'error', message: 'Authentication failed - check API key', timestamp: getCurrentTimestamp() };
  }
  if (response.status === 403) {
    return {
      status: 'error',
      message: `Partner (affiliate) API key required for ${label} - admin keys are denied`,
      timestamp: getCurrentTimestamp(),
    };
  }
  if (response.status >= 400) {
    return {
      status: 'error',
      message: response.data?.message || response.data?.error
        || `Partner ${label} API error: ${response.status} ${response.statusText}`,
      timestamp: getCurrentTimestamp(),
    };
  }
  return undefined;
}

function mapNetworkError(error: any, label: string) {
  let errorMessage: string;
  if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise server';
  else if (error.code === 'ETIMEDOUT') errorMessage = `Partner ${label} request timeout exceeded`;
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

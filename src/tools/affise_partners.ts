/**
 * Affise affiliates (partners) lookup tools.
 *
 *  - listPartners → GET /3.0/admin/partners — paginated list with filters.
 *  - getPartner   → GET /3.0/admin/partner/{id} — single affiliate detail.
 *
 * Source contracts: Affise API PartnerRoute.php (indexAction / partnerAction).
 * Both require ROLE_ADMIN.
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';
import { compactTabular } from '../utils/compact-response.js';

export interface ListPartnersParams {
  search?: string;
  id?: number[];
  manager?: string[];
  with_balance?: boolean;
  updated_at?: string;          // YYYY-MM-DD
  status?: string;
  page?: number;
  limit?: number;
  order?: string;
  orderType?: 'asc' | 'desc';
}

export interface PartnersListResult {
  status: 'ok' | 'error';
  message: string;
  data?: { partners: any[]; pagination?: any };
  metadata?: { total_count?: number; page: number; per_page: number };
  timestamp: string;
}

export async function listPartners(
  config: { baseUrl: string; apiKey: string },
  params: ListPartnersParams = {},
): Promise<PartnersListResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  try {
    const qp = new URLSearchParams();
    if (params.search) qp.append('search', params.search);
    if (params.status) qp.append('status', params.status);
    if (params.updated_at) qp.append('updated_at', params.updated_at);
    if (params.with_balance) qp.append('with_balance', '1');
    if (Array.isArray(params.id))      params.id.forEach(v => qp.append('id[]', String(v)));
    if (Array.isArray(params.manager)) params.manager.forEach(v => qp.append('manager[]', String(v)));

    qp.append('page',  String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 500)));
    if (params.order)     qp.append('order', params.order);
    if (params.orderType) qp.append('orderType', params.orderType);

    const url = `${baseUrl}/3.0/admin/partners?${qp.toString()}`;

    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 20000,
      validateStatus: status => status < 500,
    });

    const mapped = mapHttpStatusToError(response, 'partners list');
    if (mapped) return mapped;

    const data = response.data;
    const partners: any[] = Array.isArray(data?.partners) ? data.partners : [];
    const pagination = data?.pagination || {};

    // Compact tabular: flatten nested fields (manager.title, etc.), drop
    // empty columns, report drops. compactTabular detects {data: [...]} +
    // pagination shape, so we wrap the partners array under `data`.
    const compactedData = compactTabular({ data: partners, pagination });

    return {
      status: 'ok',
      message: `Retrieved ${partners.length} partners`,
      data: compactedData,
      metadata: {
        total_count: pagination.total_count,
        page: pagination.page ?? (params.page || 1),
        per_page: pagination.per_page ?? Math.min(params.limit || 100, 500),
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Partners list');
  }
}

export interface GetPartnerParams {
  partner_id: number;
}

export interface GetPartnerResult {
  status: 'ok' | 'error';
  message: string;
  data?: { partner: any };
  timestamp: string;
}

export async function getPartner(
  config: { baseUrl: string; apiKey: string },
  params: GetPartnerParams,
): Promise<GetPartnerResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!Number.isInteger(params.partner_id) || params.partner_id <= 0) {
    return {
      status: 'error',
      message: 'partner_id is required and must be a positive integer',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const url = `${baseUrl}/3.0/admin/partner/${params.partner_id}`;
    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 15000,
      validateStatus: status => status < 500,
    });

    const mapped = mapHttpStatusToError(response, 'partner detail', { notFoundMsg: 'Affiliate does not exist' });
    if (mapped) return mapped;

    // BaseController::resultSuccess emits numeric `status: 1` — entity-key
    // presence is the success signal, not the string "success".
    const data = response.data;
    if (!data?.partner) {
      return {
        status: 'error',
        message: data?.error || 'Unexpected response shape from partner detail endpoint',
        timestamp: getCurrentTimestamp(),
      };
    }
    return {
      status: 'ok',
      message: `Partner ${params.partner_id} retrieved`,
      data: { partner: data.partner },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Partner detail');
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
      message: response.data?.error || 'Access denied - admin role required',
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
  else if (error.code === 'ENOTFOUND') errorMessage = 'Affise server not found (DNS error)';
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

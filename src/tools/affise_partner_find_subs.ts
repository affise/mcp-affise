/**
 * Affise partner find-subs — wraps `GET /3.0/stats/find-subs`.
 *
 * Source: Affise API StatsRoute → StatisticsLTController::getSubs.
 * Requires ROLE_PARTNER. Returns distinct sub values from the partner's own
 * data, scoped by ONE of sub1..sub5 (the controller loops 1..5 and breaks on
 * the first non-empty parameter — passing multiple wastes bandwidth).
 *
 * Use case: "what sub1 values do I have in recent data" → then drill via
 * affise_stats_raw with the discovered values.
 *
 * Response: { status: 1, subs: ["value1", "value2", ...], pagination: {...} }
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export type SubKey = 'sub1' | 'sub2' | 'sub3' | 'sub4' | 'sub5';

export interface PartnerFindSubsParams {
  // Pick exactly ONE of these; backend ignores everything past the first set value.
  sub_key: SubKey;
  // Optional partial-match filter — narrows distinct values to those matching.
  // Server semantics: empty string returns top-N distinct values for the sub.
  sub_value?: string;
  page?: number;
  limit?: number;
}

export interface PartnerFindSubsResult {
  status: 'ok' | 'error';
  message: string;
  data?: { subs: any[]; pagination?: any; sub_key: SubKey };
  metadata?: { total_count?: number; page: number; per_page: number };
  timestamp: string;
}

const VALID_SUB_KEYS: ReadonlySet<SubKey> = new Set(['sub1', 'sub2', 'sub3', 'sub4', 'sub5']);

export async function findPartnerSubs(
  config: { baseUrl: string; apiKey: string },
  params: PartnerFindSubsParams,
): Promise<PartnerFindSubsResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!params?.sub_key || !VALID_SUB_KEYS.has(params.sub_key)) {
    return {
      status: 'error',
      message: 'sub_key is required and must be one of: sub1, sub2, sub3, sub4, sub5',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const qp = new URLSearchParams();
    // Pass the chosen sub key with the optional value (or empty string).
    // Backend's `for ($i=1..5) if !empty(sub$i)` breaks on the first match.
    qp.append(params.sub_key, params.sub_value ?? '');
    qp.append('page',  String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 500)));

    const url = `${baseUrl}/3.0/stats/find-subs?${qp.toString()}`;

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
        message: 'Partner (affiliate) API key required for /stats/find-subs - admin keys are denied',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.message || response.data?.error
          || `find-subs API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    const data = response.data;
    const subs: any[] = Array.isArray(data?.subs) ? data.subs : [];
    const pagination = data?.pagination || {};

    return {
      status: 'ok',
      message: `Retrieved ${subs.length} distinct ${params.sub_key} values`,
      data: { subs, pagination, sub_key: params.sub_key },
      metadata: {
        total_count: pagination.total_count ?? pagination.count,
        page: pagination.page ?? pagination.current_page ?? (params.page || 1),
        per_page: pagination.per_page ?? Math.min(params.limit || 100, 500),
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'find-subs');
  }
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

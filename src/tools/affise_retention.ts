/**
 * Affise retention rate analysis — wraps `GET /3.0/stats/retentionrate`.
 *
 * Source contract: Affise API StatisticsLTController::retentionRateAction.
 * Requires ROLE_ADMIN. Form: RetentionRateFilter.
 *
 * Cohort-style retention: for a single offer, given a base event and a set
 * of follow-up events, returns retention rates per bucket. Date range and
 * affiliate filter are optional. Backend passes the request straight to
 * the Go API; response shape is whatever Go returns (typically `{ data: [...] }`).
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface RetentionRateParams {
  date_from: string;                // YYYY-MM-DD, REQUIRED
  date_to: string;                  // YYYY-MM-DD, REQUIRED
  offer: number;                    // REQUIRED
  base_event: string;               // REQUIRED — base goal name; regex ^[a-zA-Z]
  events: string[];                 // REQUIRED — array of event names; regex ^[a-zA-Z]
  timezone?: string;                // IANA timezone; backend defaults to Europe/Moscow
  affiliate_id?: number;
  describe?: boolean;
  page?: number;                    // default 1
  limit?: number;                   // default 100, max 100
}

export interface RetentionRateResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

export async function getRetentionRate(
  config: { baseUrl: string; apiKey: string },
  params: RetentionRateParams,
): Promise<RetentionRateResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!params.date_from || !params.date_to) {
    return {
      status: 'error',
      message: 'date_from and date_to are required (YYYY-MM-DD)',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (!Number.isInteger(params.offer) || params.offer <= 0) {
    return {
      status: 'error',
      message: 'offer is required and must be a positive integer',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (!params.base_event || typeof params.base_event !== 'string') {
    return {
      status: 'error',
      message: 'base_event is required (event name string)',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (!Array.isArray(params.events) || params.events.length === 0
      || !params.events.every(e => typeof e === 'string' && e.length > 0)) {
    return {
      status: 'error',
      message: 'events is required and must be a non-empty array of event-name strings',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const qp = new URLSearchParams();
    qp.append('date_from',  params.date_from);
    qp.append('date_to',    params.date_to);
    qp.append('offer',      String(params.offer));
    qp.append('base_event', params.base_event);
    // events is Array[string] per the public docs — serialize as repeated
    // events[]=name1&events[]=name2 so the Symfony form binds it as an array.
    params.events.forEach(e => qp.append('events[]', e));
    if (params.timezone)    qp.append('timezone', params.timezone);
    if (params.affiliate_id !== undefined) qp.append('affiliate_id', String(params.affiliate_id));
    if (params.describe)    qp.append('describe', '1');
    qp.append('page',  String(params.page || 1));
    qp.append('limit', String(Math.min(params.limit || 100, 100)));

    const url = `${baseUrl}/3.0/stats/retentionrate?${qp.toString()}`;

    const response = await axios.get(url, {
      headers: { 'api-key': apiKey, 'Accept': 'application/json' },
      timeout: 30000,
      validateStatus: status => status < 500,
    });

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
    if (response.status >= 400) {
      // Go API may return error detail under .error, .message, or .detail —
      // try each so callers see the actual reason (e.g. unknown event name).
      const detail = response.data?.error
        || response.data?.message
        || response.data?.detail;
      return {
        status: 'error',
        message: detail
          ? `Retention rate API error: ${response.status} — ${detail}`
          : `Retention rate API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    return {
      status: 'ok',
      message: 'Retention rate retrieved',
      data: response.data,
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Retention rate');
  }
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

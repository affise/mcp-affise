/**
 * Affise time-to-action analysis — wraps `GET /3.0/stats/time-to-action`.
 *
 * Source contract: Affise API StatisticsLTController::timeToAction.
 * Requires ROLE_ADMIN. Form: TimeToActionFilter.
 *
 * Funnel timing: click → conversion latency distribution for a single offer.
 * The response is enriched server-side with `affiliate_name` / `affiliate_email`
 * via PartnerProvider, so each row already includes affiliate context.
 *
 * Note: backend returns HTTP 404 if the CTIT (Click-Time-to-Action) feature
 * is not enabled on the tenant — surface that distinctly so the caller knows
 * to ask the platform admin to enable it.
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface TimeToActionParams {
  date_from: string;              // YYYY-MM-DD, required
  date_to: string;                // YYYY-MM-DD, required
  offer_id: number;               // required
  timezone?: string;              // IANA timezone; defaults to Europe/Moscow
  affiliate_ids?: string;         // comma-separated or single ID
  goal?: string;                  // goal/event name filter
  page?: number;
  limit?: number;                 // max 500
}

export interface TimeToActionResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;
  timestamp: string;
}

export async function getTimeToAction(
  config: { baseUrl: string; apiKey: string },
  params: TimeToActionParams,
): Promise<TimeToActionResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!params.date_from || !params.date_to) {
    return {
      status: 'error',
      message: 'date_from and date_to are required',
      timestamp: getCurrentTimestamp(),
    };
  }
  if (!Number.isInteger(params.offer_id) || params.offer_id <= 0) {
    return {
      status: 'error',
      message: 'offer_id is required and must be a positive integer',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const qp = new URLSearchParams();
    qp.append('date_from', params.date_from);
    qp.append('date_to',   params.date_to);
    qp.append('offer_id',  String(params.offer_id));
    if (params.timezone)      qp.append('timezone', params.timezone);
    if (params.affiliate_ids) qp.append('affiliate_ids', params.affiliate_ids);
    if (params.goal)          qp.append('goal', params.goal);
    if (params.page !== undefined)  qp.append('page', String(params.page));
    if (params.limit !== undefined) qp.append('limit', String(Math.min(params.limit, 500)));

    const url = `${baseUrl}/3.0/stats/time-to-action?${qp.toString()}`;

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
    if (response.status === 404) {
      // Backend returns 404 specifically when CTIT feature is disabled
      // on this tenant — surface it distinctly.
      return {
        status: 'error',
        message: response.data?.error
          || 'Time-to-action feature (CTIT) is not enabled for this tenant',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.error || `Time-to-action API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    return {
      status: 'ok',
      message: 'Time-to-action data retrieved',
      data: response.data,
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Time-to-action');
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
    else if (s === 404) errorMessage = apiErr || 'Time-to-action feature (CTIT) is not enabled for this tenant';
    else if (s === 400) errorMessage = apiErr || `Bad request: ${error.response.data?.message || 'Invalid parameters'}`;
    else if (s === 429) errorMessage = 'Rate limit exceeded';
    else errorMessage = apiErr || `HTTP ${s}: ${error.response.statusText}`;
  } else {
    errorMessage = error.message;
  }
  return { status: 'error' as const, message: errorMessage, timestamp: getCurrentTimestamp() };
}

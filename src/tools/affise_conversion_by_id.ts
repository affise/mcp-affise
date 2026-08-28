/**
 * Affise single-conversion drill-down — wraps `GET /3.0/stats/conversionsbyid`.
 *
 * Source contract: Affise API
 * StatisticsLTController::clickHouseConversionByIdAction.
 * Requires ROLE_ADMIN. Routed at both `/3.0/stats/conversionsbyid?id=...`
 * and `/3.0/stats/conversions/{id}`. We use the query-param form for
 * simpler URL construction.
 *
 * Returns a single fully-mapped conversion record (Conversion.php fields —
 * id, action_id, status, offer, country, custom_field_1..15, createdAt,
 * price, etc.). Designed as the drill-down companion to
 * affise_conversions_raw which returns a paginated list.
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface ConversionByIdParams {
  id: string;                       // MongoId 24-char hex (conversion id)
  timezone?: string;                // optional IANA timezone override
}

export interface ConversionByIdResult {
  status: 'ok' | 'error';
  message: string;
  data?: any;                       // unwrapped conversion object
  timestamp: string;
}

const MONGO_ID_RE = /^[a-f0-9]{24}$/i;

export async function getConversionById(
  config: { baseUrl: string; apiKey: string },
  params: ConversionByIdParams,
): Promise<ConversionByIdResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (typeof params.id !== 'string' || !MONGO_ID_RE.test(params.id)) {
    return {
      status: 'error',
      message: 'id is required and must be a 24-character hex MongoId',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const qp = new URLSearchParams();
    qp.append('id', params.id);
    if (params.timezone) qp.append('timezone', params.timezone);

    const url = `${baseUrl}/3.0/stats/conversionsbyid?${qp.toString()}`;

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
        message: response.data?.error || 'Access denied - admin role required or GDPR restriction',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status === 404) {
      return {
        status: 'error',
        message: response.data?.error || `Conversion ${params.id} not found`,
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.error || `Conversion lookup API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    // Go API typically returns { status, conversion: {...}, statusCode }
    // around the mapped Conversion object. Unwrap to a flat { conversion }
    // for consistency with other detail tools (affise_get_offer etc.).
    const data = response.data;
    if (!data || typeof data !== 'object') {
      return {
        status: 'error',
        message: 'Unexpected response shape from conversion-by-id endpoint',
        timestamp: getCurrentTimestamp(),
      };
    }
    const conversion = data.conversion ?? data;

    return {
      status: 'ok',
      message: `Conversion ${params.id} retrieved`,
      data: { conversion },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Conversion lookup');
  }
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
    else if (s === 403) errorMessage = apiErr || 'Access denied or GDPR restriction';
    else if (s === 404) errorMessage = apiErr || 'Conversion not found';
    else if (s === 400) errorMessage = apiErr || `Bad request: ${error.response.data?.message || 'Invalid parameters'}`;
    else if (s === 429) errorMessage = 'Rate limit exceeded';
    else errorMessage = apiErr || `HTTP ${s}: ${error.response.statusText}`;
  } else {
    errorMessage = error.message;
  }
  return { status: 'error' as const, message: errorMessage, timestamp: getCurrentTimestamp() };
}

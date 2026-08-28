/**
 * Affise single-offer lookup — wraps `GET /3.0/offer/{offerId}`.
 *
 * Source contract: Affise API OffersRoute.php → OffersController::offerAction.
 * Requires IS_AUTHENTICATED_FULLY (any logged-in role).
 *
 * Complements affise_search_offers (which returns a list) by providing the
 * full detail object for a single offer when the ID is known (e.g. from a
 * conversion row or a previous search result).
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface GetOfferParams {
  offer_id: number;
}

export interface GetOfferResult {
  status: 'ok' | 'error';
  message: string;
  data?: { offer: any };
  timestamp: string;
}

export async function getOfferDetail(
  config: { baseUrl: string; apiKey: string },
  params: GetOfferParams,
): Promise<GetOfferResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }
  if (!Number.isInteger(params.offer_id) || params.offer_id <= 0) {
    return {
      status: 'error',
      message: 'offer_id is required and must be a positive integer',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const url = `${baseUrl}/3.0/offer/${params.offer_id}`;

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
        message: response.data?.error || 'Access denied',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status === 404) {
      return {
        status: 'error',
        message: response.data?.error || 'Offer not found',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.error || `Offer detail API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    // BaseController::resultSuccess emits numeric `status: 1` (RESPONSE_STATUS_SUCCESS),
    // NOT the string "success" — entity-key presence is the success signal.
    const data = response.data;
    if (!data?.offer) {
      return {
        status: 'error',
        message: data?.error || 'Unexpected response shape from offer detail endpoint',
        timestamp: getCurrentTimestamp(),
      };
    }

    return {
      status: 'ok',
      message: `Offer ${params.offer_id} retrieved`,
      data: { offer: data.offer },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error);
  }
}

function mapNetworkError(error: any) {
  let errorMessage: string;
  if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise server';
  else if (error.code === 'ETIMEDOUT') errorMessage = 'Offer detail request timeout exceeded';
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

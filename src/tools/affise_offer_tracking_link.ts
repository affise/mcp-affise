/**
 * Affise offer tracking link tool — wraps `POST /3.0/admin/offer/{offerId}/tracking-link`.
 *
 * Source contract: Affise API OffersRoute.php → OffersController::getTrackingLinkAction.
 * Request form: Forms/Offer/TrackingLinkForm.php.
 *
 * Generates a tracking link for a specific offer + affiliate pair. Admin/manager
 * only (ROLE_ADMIN). Privacy check via OfferProvider::canPartnerUseLink enforces
 * that the affiliate is allowed to run the offer based on its privacy settings.
 *
 * Success: { status: "success", tracking_link: "https://..." }
 * Errors:  { status: "error",   error: "..." } with HTTP 400/403/404.
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface OfferTrackingLinkParams {
  offer_id: number;
  affiliate_id: number;
  sub1?: string;
  sub2?: string;
  sub3?: string;
  sub4?: string;
  sub5?: string;
  sub6?: string;
  sub7?: string;
  sub8?: string;
}

export interface OfferTrackingLinkResult {
  status: 'ok' | 'error';
  message: string;
  data?: {
    tracking_link: string;
    offer_id: number;
    affiliate_id: number;
  };
  timestamp: string;
}

const SUB_KEYS = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8'] as const;

export async function getOfferTrackingLink(
  config: { baseUrl: string; apiKey: string },
  params: OfferTrackingLinkParams,
): Promise<OfferTrackingLinkResult> {
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      status: 'error',
      message: 'baseUrl or apiKey not provided',
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

  if (!Number.isInteger(params.affiliate_id) || params.affiliate_id <= 0) {
    return {
      status: 'error',
      message: 'affiliate_id is required and must be a positive integer',
      timestamp: getCurrentTimestamp(),
    };
  }

  try {
    const url = `${baseUrl}/3.0/admin/offer/${params.offer_id}/tracking-link`;

    // Symfony form expects fields at root level (no nesting) and rejects JSON
    // with `[affiliate_id].data: Specify not empty 'affiliate_id'`. Send as
    // application/x-www-form-urlencoded so the form binder reads the fields.
    // Extra keys would trigger "Method does not allow extra fields".
    const formBody = new URLSearchParams();
    formBody.append('affiliate_id', String(params.affiliate_id));
    for (const key of SUB_KEYS) {
      const value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        formBody.append(key, String(value));
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('Tracking link API URL:', url, 'body:', formBody.toString());
    }

    const response = await axios.post(url, formBody.toString(), {
      headers: {
        'api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
      validateStatus: status => status < 500,
    });

    if (response.status === 401) {
      return {
        status: 'error',
        message: 'Authentication failed - check API key',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status === 403) {
      return {
        status: 'error',
        message: response.data?.error || 'Access denied - affiliate cannot use this offer or insufficient role (admin/manager required)',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status === 404) {
      return {
        status: 'error',
        message: response.data?.error || 'Offer or affiliate not found',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.error
          || `Tracking link API returned error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    // Affise responds with `{status: 1, tracking_link: "..."}` (numeric status,
    // not the `"success"` string used by some other endpoints). The public
    // API does NOT wrap detail responses in `status: "success"` — check the
    // entity-key presence (`tracking_link`) as the success signal.
    const data = response.data;
    const trackingLink: string | undefined = data?.tracking_link;

    if (!trackingLink) {
      return {
        status: 'error',
        message: data?.error || 'Unexpected response shape from tracking-link endpoint',
        timestamp: getCurrentTimestamp(),
      };
    }

    return {
      status: 'ok',
      message: 'Tracking link generated successfully',
      data: {
        tracking_link: trackingLink,
        offer_id: params.offer_id,
        affiliate_id: params.affiliate_id,
      },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    let errorMessage: string;
    if (error.code === 'ECONNREFUSED') errorMessage = 'Unable to connect to Affise server';
    else if (error.code === 'ETIMEDOUT') errorMessage = 'Tracking link request timeout exceeded';
    else if (error.code === 'ENOTFOUND') errorMessage = 'Affise server not found (DNS error)';
    else if (error.response) {
      const s = error.response.status;
      const apiErr = error.response.data?.error;
      if (s === 401) errorMessage = 'Authentication failed - check API key';
      else if (s === 403) errorMessage = apiErr || 'Access denied';
      else if (s === 404) errorMessage = apiErr || 'Offer or affiliate not found';
      else if (s === 400) errorMessage = apiErr || `Bad request: ${error.response.data?.message || 'Invalid parameters'}`;
      else if (s === 429) errorMessage = 'Rate limit exceeded - too many requests';
      else errorMessage = apiErr || `HTTP ${s}: ${error.response.statusText}`;
    } else {
      errorMessage = error.message;
    }
    return {
      status: 'error',
      message: errorMessage,
      timestamp: getCurrentTimestamp(),
    };
  }
}

/**
 * Affise partner balance — wraps `GET /3.0/balance`.
 *
 * Source: Affise API UserRoute → UserController::balanceAction.
 * Requires ROLE_PARTNER. Returns multi-currency balance broken down by
 * type (withdrawal, pending, ...) keyed by currency code.
 *
 * Response shape: { status: 1, balance: { withdrawal: { USD: 100.00, EUR: 50.00 }, pending: {...} } }
 */

import axios from 'axios';
import { getCurrentTimestamp } from '../shared/date-utils.js';

export interface PartnerBalanceResult {
  status: 'ok' | 'error';
  message: string;
  data?: { balance: Record<string, Record<string, number>> };
  timestamp: string;
}

export async function getPartnerBalance(
  config: { baseUrl: string; apiKey: string },
): Promise<PartnerBalanceResult> {
  const { baseUrl, apiKey } = config;
  if (!baseUrl || !apiKey) {
    return { status: 'error', message: 'baseUrl or apiKey not provided', timestamp: getCurrentTimestamp() };
  }

  try {
    const url = `${baseUrl}/3.0/balance`;
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
        message: 'Partner (affiliate) API key required - admin keys do not have access to /3.0/balance',
        timestamp: getCurrentTimestamp(),
      };
    }
    if (response.status >= 400) {
      return {
        status: 'error',
        message: response.data?.message || response.data?.error
          || `Partner balance API error: ${response.status} ${response.statusText}`,
        timestamp: getCurrentTimestamp(),
      };
    }

    const data = response.data;
    if (data?.balance === undefined) {
      return {
        status: 'error',
        message: data?.message || 'Unexpected response shape from balance endpoint (missing `balance` key)',
        timestamp: getCurrentTimestamp(),
      };
    }

    return {
      status: 'ok',
      message: 'Partner balance retrieved',
      data: { balance: data.balance },
      timestamp: getCurrentTimestamp(),
    };
  } catch (error: any) {
    return mapNetworkError(error, 'Partner balance');
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

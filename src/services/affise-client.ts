/**
 * Affise API Client
 *
 * Centralized client for making requests to Affise API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

export interface AffiseClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

/**
 * Affise role inferred from `user.type` on /3.1/user/me. Used by the Tier
 * 3.4 startup-time tools/list filter so an MCP deployment with a partner
 * key automatically hides the admin-only tools — without the operator
 * setting AFFISE_ROLE by hand.
 *
 * `permissions` looks like the same shape across all roles — same key
 * set, different values inside — so it's NOT a reliable discriminator.
 * `user.type` is.
 */
export type AffiseRole = 'admin' | 'partner' | 'advertiser' | 'unknown';

/**
 * Map Affise's `user.type` string to our role taxonomy.
 *
 * Vocabulary of Affise user types:
 *   affiliate          → partner (publisher)
 *   advertiser         → advertiser (its own role, NOT admin)
 *   affiliate_manager  → admin
 *   account_manager    → admin
 *   common_manager     → admin
 *   client             → admin (tenant owner)
 *   root               → admin (super-admin)
 *
 * Explicit whitelist over a catch-all so that a future user type added
 * upstream won't be silently mis-classified as admin. Anything
 * outside the known set falls back to 'unknown' → caller registers all
 * tools (the default behaviour).
 *
 * Real values observed against a live tenant:
 *   admin   key → user.type = "common_manager"
 *   partner key → user.type = "affiliate"
 */
export function deriveRole(type?: string): AffiseRole {
  switch (type) {
    case 'affiliate':         return 'partner';
    case 'advertiser':        return 'advertiser';
    case 'affiliate_manager':
    case 'account_manager':
    case 'common_manager':
    case 'client':
    case 'root':              return 'admin';
    default:                  return 'unknown';
  }
}

export interface AffiseUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  type?: string;
  roles?: string[];
  /** Derived from `type` via deriveRole() — never sent over the wire by Affise. */
  detectedRole: AffiseRole;
}

export interface AffiseResponse<T = any> {
  status: number;
  data?: T;
  message?: string;
}

/**
 * Affise API Client
 */
export class AffiseClient {
  private client: AxiosInstance;
  private baseUrl: string;
  private apiKey: string;

  constructor(config: AffiseClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'API-Key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
  }

  /**
   * Validate credentials and get current user info
   *
   * Calls /3.1/user/me endpoint to verify API key is valid
   * and retrieve user information
   *
   * @throws Error if credentials are invalid
   * @returns User information
   */
  async getMe(): Promise<AffiseUser> {
    try {
      const response = await this.client.get('/3.1/user/me');

      // Affise API returns: { status: 1, user: {...} }
      const data = response.data;

      if (data.status !== 1) {
        throw new Error('Affise API returned error status');
      }

      if (!data.user) {
        throw new Error('No user data in Affise response');
      }

      return {
        id: data.user.id || data.user._id || 'unknown',
        email: data.user.email || 'unknown',
        first_name: data.user.first_name || data.user.firstName,
        last_name: data.user.last_name || data.user.lastName,
        type: data.user.type,
        roles: data.user.roles,
        detectedRole: deriveRole(data.user.type),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          throw new Error('Invalid Affise API credentials');
        }

        if (axiosError.code === 'ECONNREFUSED') {
          throw new Error('Cannot reach that Affise URL — the server refused the connection. Double-check the URL is reachable from the public internet.');
        }

        if (axiosError.code === 'ETIMEDOUT') {
          throw new Error('Connection to Affise timed out. The server is reachable but did not respond — try again, or check your tenant status.');
        }

        if (axiosError.code === 'ENOTFOUND') {
          throw new Error(
            "We couldn't find that Affise URL. Check for typos and that it's your tenant's public API URL (e.g. https://api-company.affise.com) — internal-network URLs won't resolve from here.",
          );
        }

        throw new Error(`Affise API error: ${axiosError.message}`);
      }

      throw error;
    }
  }

  /**
   * Make a generic GET request to Affise API
   */
  async get<T = any>(path: string, params?: Record<string, any>): Promise<AffiseResponse<T>> {
    try {
      const response = await this.client.get(path, { params });
      return {
        status: response.status,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Make a generic POST request to Affise API
   */
  async post<T = any>(path: string, data?: any): Promise<AffiseResponse<T>> {
    try {
      const response = await this.client.post(path, data);
      return {
        status: response.status,
        data: response.data
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Handle axios errors
   */
  private handleError(error: any): AffiseResponse {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      return {
        status: axiosError.response?.status || 500,
        message: axiosError.message,
        data: axiosError.response?.data
      };
    }

    return {
      status: 500,
      message: error.message || 'Unknown error'
    };
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Test connection to Affise API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Create Affise client from environment variables
 */
export function createAffiseClientFromEnv(): AffiseClient {
  const baseUrl = process.env.AFFISE_BASE_URL;
  const apiKey = process.env.AFFISE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error('AFFISE_BASE_URL and AFFISE_API_KEY environment variables are required');
  }

  return new AffiseClient({ baseUrl, apiKey });
}

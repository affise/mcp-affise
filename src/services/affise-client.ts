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

export interface AffiseUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  type?: string;
  roles?: string[];
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
        roles: data.user.roles
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          throw new Error('Invalid Affise API credentials');
        }

        if (axiosError.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to Affise API server');
        }

        if (axiosError.code === 'ETIMEDOUT') {
          throw new Error('Connection to Affise API timed out');
        }

        if (axiosError.code === 'ENOTFOUND') {
          throw new Error('Affise API server not found (DNS error)');
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

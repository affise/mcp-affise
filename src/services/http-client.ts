/**
 * HTTP Client Service - Centralized HTTP client with connection pooling
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ErrorHandlerService } from './error-handler-service.js';

export interface HttpClientOptions {
  timeout?: number;
  maxRedirects?: number;
  maxConnections?: number;
  keepAlive?: boolean;
  keepAliveMsecs?: number;
}

export class HttpClientService {
  private static instance: HttpClientService;
  private client: AxiosInstance;
  private errorHandler: ErrorHandlerService;

  private constructor(options: HttpClientOptions = {}) {
    this.errorHandler = new ErrorHandlerService();
    this.client = axios.create({
      timeout: options.timeout || 30000,
      maxRedirects: options.maxRedirects || 3,
      headers: {
        'User-Agent': 'Affise-MCP-Server/1.2.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      // Connection pooling configuration
      httpAgent: new (require('http').Agent)({
        keepAlive: options.keepAlive !== false,
        keepAliveMsecs: options.keepAliveMsecs || 1000,
        maxSockets: options.maxConnections || 100,
        maxFreeSockets: 10,
        timeout: 60000,
        freeSocketTimeout: 30000,
      }),
      httpsAgent: new (require('https').Agent)({
        keepAlive: options.keepAlive !== false,
        keepAliveMsecs: options.keepAliveMsecs || 1000,
        maxSockets: options.maxConnections || 100,
        maxFreeSockets: 10,
        timeout: 60000,
        freeSocketTimeout: 30000,
      }),
    });

    // Add request interceptor for logging in development
    this.client.interceptors.request.use(
      (config) => {
        if (process.env.NODE_ENV === 'development') {
          const sanitizedUrl = this.errorHandler.sanitizeErrorMessage(config.url || 'unknown');
          console.debug(`HTTP Request: ${config.method?.toUpperCase()} [URL_REDACTED]`);
        }
        return config;
      },
      (error) => {
        console.error('HTTP Request Error:', this.errorHandler.sanitizeErrorMessage(error?.message || 'Request failed'));
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`HTTP Response: ${response.status} [URL_REDACTED]`);
        }
        return response;
      },
      (error) => {
        const status = error.response?.status;
        const sanitizedUrl = this.errorHandler.sanitizeErrorMessage(error.config?.url || 'unknown');
        
        if (status === 429) {
          console.warn(`Rate limit hit for request`);
        } else if (status >= 500) {
          console.error(`Server error ${status} for request`);
        } else if (status >= 400) {
          console.warn(`Client error ${status} for request`);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Get singleton instance
   */
  public static getInstance(options?: HttpClientOptions): HttpClientService {
    if (!HttpClientService.instance) {
      HttpClientService.instance = new HttpClientService(options);
    }
    return HttpClientService.instance;
  }

  /**
   * Make GET request
   */
  public async get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  /**
   * Make POST request
   */
  public async post<T = unknown>(
    url: string, 
    data?: unknown, 
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  /**
   * Make PUT request
   */
  public async put<T = unknown>(
    url: string, 
    data?: unknown, 
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  /**
   * Make DELETE request
   */
  public async delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  /**
   * Get the underlying axios instance
   */
  public getAxiosInstance(): AxiosInstance {
    return this.client;
  }

  /**
   * Destroy the HTTP client and clean up connections
   */
  public destroy(): void {
    // Close all connections
    this.client.defaults.httpAgent?.destroy();
    this.client.defaults.httpsAgent?.destroy();
    
    // Clear interceptors
    this.client.interceptors.request.clear();
    this.client.interceptors.response.clear();
    
    // Reset singleton
    HttpClientService.instance = null as any;
  }
}

/**
 * Default HTTP client instance
 */
export const httpClient = HttpClientService.getInstance();
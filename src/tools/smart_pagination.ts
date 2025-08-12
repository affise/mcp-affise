/**
 * 🧠 Smart Pagination Strategy
 * 
 * A sophisticated pagination system that intelligently handles large datasets
 * by showing samples first, then offering complete results based on user needs.
 * 
 * Key Features:
 * - Sample-first approach for quick previews
 * - Intelligent threshold detection
 * - Progressive loading with user consent
 * - Performance optimization
 * - Memory-efficient streaming
 * - Error recovery mechanisms
 */

import { getCurrentTimestamp } from '../shared/date-utils.js';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PaginationConfig {
  // Sample configuration
  initialSampleSize: number;           // Initial sample size (default: 100)
  maxSampleSize: number;              // Maximum sample before asking user (default: 500)
  
  // Performance thresholds
  largeDatasetThreshold: number;       // When to consider dataset "large" (default: 1000)
  hugeDatasetThreshold: number;        // When to warn about huge datasets (default: 10000)
  
  // Request configuration  
  maxPageSize: number;                // Maximum items per API request (default: 500)
  requestDelay: number;               // Delay between requests in ms (default: 100)
  maxConcurrentRequests: number;      // Max parallel requests (default: 3)
  
  // Timeout and retry
  requestTimeout: number;             // Request timeout in ms (default: 30000)
  maxRetries: number;                 // Max retry attempts (default: 3)
  retryDelay: number;                 // Delay between retries in ms (default: 1000)
  
  // User experience
  showProgress: boolean;              // Show progress during fetching (default: true)
  askUserConfirmation: boolean;       // Ask before fetching large datasets (default: true)
  autoOptimize: boolean;              // Auto-optimize request sizes (default: true)
}

export interface PaginationRequest<T = any> {
  page: number;
  limit: number;
  params: T;
}

export interface PaginationResponse<T = any> {
  data: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
  metadata?: any;
}

export interface SmartPaginationResult<T = any> {
  status: 'sample' | 'complete' | 'error' | 'user_confirmation_required';
  message: string;
  
  // Data
  data: T[];
  sampleData?: T[];
  
  // Pagination info
  totalItems: number;
  totalPages: number;
  itemsRetrieved: number;
  pagesProcessed: number;
  
  // Performance metrics
  executionTime: number;
  requestCount: number;
  averageRequestTime: number;
  
  // User decision support
  estimatedFullTime?: number;
  estimatedMemoryUsage?: number;
  recommendations: string[];
  
  // Continuation support
  canContinue: boolean;
  continuationToken?: string;
  
  // Error handling
  errors: string[];
  warnings: string[];
  
  timestamp: string;
}

export interface DataFetcher<TParams = any, TResponse = any> {
  fetch: (request: PaginationRequest<TParams>) => Promise<PaginationResponse<TResponse>>;
  name: string;
}

// ============================================================================
// SMART PAGINATION ENGINE
// ============================================================================

export class SmartPaginationEngine {
  private config: PaginationConfig;
  private requestMetrics: {
    totalRequests: number;
    totalTime: number;
    averageTime: number;
    errors: number;
  } = {
    totalRequests: 0,
    totalTime: 0,
    averageTime: 0,
    errors: 0
  };

  constructor(config: Partial<PaginationConfig> = {}) {
    this.config = {
      initialSampleSize: 100,
      maxSampleSize: 500,
      largeDatasetThreshold: 1000,
      hugeDatasetThreshold: 10000,
      maxPageSize: 500,
      requestDelay: 100,
      maxConcurrentRequests: 3,
      requestTimeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      showProgress: true,
      askUserConfirmation: true,
      autoOptimize: true,
      ...config
    };
  }

  /**
   * Main smart pagination method - determines strategy and executes
   */
  async paginate<TParams, TResponse>(
    fetcher: DataFetcher<TParams, TResponse>,
    params: TParams,
    options: {
      strategy?: 'sample_first' | 'progressive' | 'streaming' | 'all_at_once';
      userIntent?: 'explore' | 'analyze' | 'export';
      forceComplete?: boolean;
      onProgress?: (progress: { 
        page: number; 
        totalPages: number; 
        itemsRetrieved: number; 
        estimatedTimeRemaining: number;
      }) => void;
    } = {}
  ): Promise<SmartPaginationResult<TResponse>> {
    const startTime = Date.now();
    const {
      strategy = 'sample_first',
      userIntent = 'explore',
      forceComplete = false,
      onProgress
    } = options;

    try {
      // Step 1: Get initial sample to understand dataset size
      const sampleResult = await this.getSample(fetcher, params);
      
      if (sampleResult.status === 'error') {
        return sampleResult;
      }

      const totalItems = sampleResult.totalItems;
      const executionTime = Date.now() - startTime;

      // Step 2: Determine if we need user confirmation
      if (this.needsUserConfirmation(totalItems, userIntent) && !forceComplete) {
        return {
          ...sampleResult,
          status: 'user_confirmation_required',
          message: this.generateConfirmationMessage(totalItems, userIntent),
          recommendations: this.generateRecommendations(totalItems, userIntent, sampleResult.data.length),
          executionTime,
          canContinue: true,
          continuationToken: this.generateContinuationToken(fetcher, params, sampleResult)
        };
      }

      // Step 3: If sample is sufficient or user wants only sample
      if (strategy === 'sample_first' && !forceComplete && this.isSampleSufficient(sampleResult, userIntent)) {
        return {
          ...sampleResult,
          status: 'sample',
          executionTime,
          recommendations: ['Sample data is sufficient for exploration', 'Use getAllResults() if you need complete dataset'],
          canContinue: true,
          continuationToken: this.generateContinuationToken(fetcher, params, sampleResult)
        };
      }

      // Step 4: Get complete dataset
      return await this.getCompleteDataset(fetcher, params, sampleResult, { onProgress });

    } catch (error: any) {
      return {
        status: 'error',
        message: `Pagination failed: ${error.message}`,
        data: [],
        totalItems: 0,
        totalPages: 0,
        itemsRetrieved: 0,
        pagesProcessed: 0,
        executionTime: Date.now() - startTime,
        requestCount: this.requestMetrics.totalRequests,
        averageRequestTime: this.requestMetrics.averageTime,
        recommendations: ['Check your API credentials', 'Verify network connectivity', 'Try with smaller parameters'],
        canContinue: false,
        errors: [error.message],
        warnings: [],
        timestamp: getCurrentTimestamp()
      };
    }
  }

  /**
   * Get initial sample to understand dataset characteristics
   */
  private async getSample<TParams, TResponse>(
    fetcher: DataFetcher<TParams, TResponse>,
    params: TParams
  ): Promise<SmartPaginationResult<TResponse>> {
    const startTime = Date.now();

    try {
      const sampleRequest: PaginationRequest<TParams> = {
        page: 1,
        limit: Math.min(this.config.initialSampleSize, this.config.maxPageSize),
        params
      };

      const response = await this.makeRequest(fetcher, sampleRequest);
      
      const totalItems = response.pagination?.total || response.data.length;
      const totalPages = response.pagination?.pages || Math.ceil(totalItems / sampleRequest.limit);
      const hasMoreData = totalPages > 1 || (response.pagination?.hasNext ?? false);

      return {
        status: 'sample',
        message: `Retrieved sample of ${response.data.length} items${hasMoreData ? ` (${totalItems} total available)` : ' (complete dataset)'}`,
        data: response.data,
        sampleData: response.data,
        totalItems,
        totalPages,
        itemsRetrieved: response.data.length,
        pagesProcessed: 1,
        executionTime: Date.now() - startTime,
        requestCount: 1,
        averageRequestTime: Date.now() - startTime,
        recommendations: [],
        canContinue: hasMoreData,
        errors: [],
        warnings: [],
        timestamp: getCurrentTimestamp()
      };

    } catch (error: any) {
      return {
        status: 'error',
        message: `Failed to get sample: ${error.message}`,
        data: [],
        totalItems: 0,
        totalPages: 0,
        itemsRetrieved: 0,
        pagesProcessed: 0,
        executionTime: Date.now() - startTime,
        requestCount: 1,
        averageRequestTime: Date.now() - startTime,
        recommendations: ['Check API connectivity', 'Verify parameters', 'Try with simpler query'],
        canContinue: false,
        errors: [error.message],
        warnings: [],
        timestamp: getCurrentTimestamp()
      };
    }
  }

  /**
   * Get complete dataset with progressive loading
   */
  private async getCompleteDataset<TParams, TResponse>(
    fetcher: DataFetcher<TParams, TResponse>,
    params: TParams,
    sampleResult: SmartPaginationResult<TResponse>,
    options: {
      onProgress?: (progress: { 
        page: number; 
        totalPages: number; 
        itemsRetrieved: number; 
        estimatedTimeRemaining: number;
      }) => void;
    } = {}
  ): Promise<SmartPaginationResult<TResponse>> {
    const startTime = Date.now();
    const { onProgress } = options;
    
    let allData: TResponse[] = [...sampleResult.data];
    let currentPage = 2; // Start from page 2 since we already have page 1
    let hasMorePages = sampleResult.totalPages > 1;
    let requestCount = 1; // Already made 1 request for sample
    let errors: string[] = [];
    let warnings: string[] = [];

    // Optimize page size based on dataset size
    const optimizedPageSize = this.calculateOptimalPageSize(sampleResult.totalItems);

    while (hasMorePages && currentPage <= sampleResult.totalPages) {
      try {
        const request: PaginationRequest<TParams> = {
          page: currentPage,
          limit: optimizedPageSize,
          params
        };

        const requestStartTime = Date.now();
        const response = await this.makeRequest(fetcher, request);
        const requestTime = Date.now() - requestStartTime;

        // Update metrics
        this.updateMetrics(requestTime, false);
        requestCount++;

        allData.push(...response.data);

        // Update progress
        if (onProgress) {
          const progress = this.calculateProgress(currentPage, sampleResult.totalPages, allData.length, requestTime);
          onProgress(progress);
        }

        // Check if we have more pages
        hasMorePages = response.pagination?.hasNext ?? (currentPage < sampleResult.totalPages);
        currentPage++;

        // Add delay between requests if configured
        if (hasMorePages && this.config.requestDelay > 0) {
          await this.sleep(this.config.requestDelay);
        }

        // Memory usage warning
        if (allData.length > this.config.hugeDatasetThreshold) {
          warnings.push(`Large dataset (${allData.length} items) - consider using streaming or filtering`);
        }

      } catch (error: any) {
        this.updateMetrics(0, true);
        errors.push(`Error on page ${currentPage}: ${error.message}`);
        
        // Decide whether to continue or abort
        if (this.shouldAbortOnError(errors.length, currentPage)) {
          warnings.push('Stopped fetching due to multiple errors');
          break;
        }
        
        currentPage++;
      }
    }

    const executionTime = Date.now() - startTime;
    const averageRequestTime = requestCount > 0 ? executionTime / requestCount : 0;

    return {
      status: errors.length > allData.length * 0.1 ? 'error' : 'complete',
      message: `Retrieved ${allData.length} items from ${currentPage - 1} pages${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
      data: allData,
      sampleData: sampleResult.data,
      totalItems: sampleResult.totalItems,
      totalPages: sampleResult.totalPages,
      itemsRetrieved: allData.length,
      pagesProcessed: currentPage - 1,
      executionTime,
      requestCount,
      averageRequestTime,
      estimatedFullTime: executionTime,
      estimatedMemoryUsage: this.estimateMemoryUsage(allData),
      recommendations: this.generatePostFetchRecommendations(allData.length, executionTime, errors.length),
      canContinue: false,
      errors,
      warnings,
      timestamp: getCurrentTimestamp()
    };
  }

  /**
   * Continue fetching from where we left off
   */
  async continueFromToken<TParams, TResponse>(
    continuationToken: string,
    options: {
      onProgress?: (progress: { 
        page: number; 
        totalPages: number; 
        itemsRetrieved: number; 
        estimatedTimeRemaining: number;
      }) => void;
    } = {}
  ): Promise<SmartPaginationResult<TResponse>> {
    try {
      const tokenData = this.parseContinuationToken(continuationToken);
      const { fetcher, params, sampleResult } = tokenData;
      
      return await this.getCompleteDataset(fetcher, params, sampleResult, options);
      
    } catch (error: any) {
      return {
        status: 'error',
        message: `Failed to continue from token: ${error.message}`,
        data: [],
        totalItems: 0,
        totalPages: 0,
        itemsRetrieved: 0,
        pagesProcessed: 0,
        executionTime: 0,
        requestCount: 0,
        averageRequestTime: 0,
        recommendations: ['Token may be expired', 'Try starting a new pagination request'],
        canContinue: false,
        errors: [error.message],
        warnings: [],
        timestamp: getCurrentTimestamp()
      };
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async makeRequest<TParams, TResponse>(
    fetcher: DataFetcher<TParams, TResponse>,
    request: PaginationRequest<TParams>
  ): Promise<PaginationResponse<TResponse>> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout);
        });

        const response = await Promise.race([
          fetcher.fetch(request),
          timeoutPromise
        ]);

        this.updateMetrics(Date.now() - startTime, false);
        return response;

      } catch (error: any) {
        lastError = error;
        this.updateMetrics(Date.now() - startTime, true);

        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private needsUserConfirmation(totalItems: number, userIntent: string): boolean {
    if (!this.config.askUserConfirmation) return false;
    
    // Large datasets always need confirmation
    if (totalItems > this.config.largeDatasetThreshold) return true;
    
    // Intent-based confirmation
    if (userIntent === 'explore' && totalItems > this.config.maxSampleSize) return true;
    if (userIntent === 'export' && totalItems > this.config.hugeDatasetThreshold) return true;
    
    return false;
  }

  private isSampleSufficient(result: SmartPaginationResult<any>, userIntent: string): boolean {
    // For exploration, sample is usually sufficient
    if (userIntent === 'explore' && result.itemsRetrieved >= 50) return true;
    
    // For monitoring, recent sample is enough
    if (userIntent === 'monitor' && result.itemsRetrieved >= 20) return true;
    
    // For analysis and export, usually need complete data
    return false;
  }

  private calculateOptimalPageSize(totalItems: number): number {
    if (totalItems < 1000) return Math.min(100, this.config.maxPageSize);
    if (totalItems < 10000) return Math.min(250, this.config.maxPageSize);
    return this.config.maxPageSize;
  }

  private calculateProgress(currentPage: number, totalPages: number, itemsRetrieved: number, lastRequestTime: number): {
    page: number;
    totalPages: number;
    itemsRetrieved: number;
    estimatedTimeRemaining: number;
  } {
    const pagesRemaining = totalPages - currentPage;
    const estimatedTimeRemaining = pagesRemaining * (lastRequestTime + this.config.requestDelay);
    
    return {
      page: currentPage,
      totalPages,
      itemsRetrieved,
      estimatedTimeRemaining
    };
  }

  private shouldAbortOnError(errorCount: number, currentPage: number): boolean {
    // Abort if more than 50% of requests failed
    return errorCount > currentPage * 0.5;
  }

  private estimateMemoryUsage(data: any[]): number {
    // Rough estimation in MB
    if (data.length === 0) return 0;
    const avgItemSize = JSON.stringify(data[0] || {}).length;
    return (data.length * avgItemSize) / (1024 * 1024);
  }

  private updateMetrics(requestTime: number, isError: boolean): void {
    this.requestMetrics.totalRequests++;
    if (!isError) {
      this.requestMetrics.totalTime += requestTime;
      this.requestMetrics.averageTime = this.requestMetrics.totalTime / (this.requestMetrics.totalRequests - this.requestMetrics.errors);
    } else {
      this.requestMetrics.errors++;
    }
  }

  private generateConfirmationMessage(totalItems: number, userIntent: string): string {
    const size = totalItems > this.config.hugeDatasetThreshold ? 'huge' : 'large';
    const timeEstimate = this.estimateFullFetchTime(totalItems);
    
    return `Found ${totalItems} items (${size} dataset). Estimated time: ${timeEstimate}. Continue with full fetch?`;
  }

  private generateRecommendations(totalItems: number, userIntent: string, sampleSize: number): string[] {
    const recommendations = [];
    
    if (userIntent === 'explore' && sampleSize > 50) {
      recommendations.push('Sample may be sufficient for exploration');
    }
    
    if (totalItems > this.config.hugeDatasetThreshold) {
      recommendations.push('Consider adding filters to reduce dataset size');
      recommendations.push('Use streaming for memory efficiency');
    }
    
    if (totalItems > 5000) {
      recommendations.push('Large dataset - expect slower response times');
    }
    
    recommendations.push('You can cancel anytime and work with the sample data');
    
    return recommendations;
  }

  private generatePostFetchRecommendations(itemCount: number, executionTime: number, errorCount: number): string[] {
    const recommendations = [];
    
    if (executionTime > 30000) {
      recommendations.push('Consider using filters to reduce fetch time');
    }
    
    if (errorCount > 0) {
      recommendations.push('Some requests failed - check data completeness');
    }
    
    if (itemCount > 10000) {
      recommendations.push('Large dataset retrieved - consider caching results');
    }
    
    return recommendations;
  }

  private estimateFullFetchTime(totalItems: number): string {
    const avgItemsPerRequest = this.config.maxPageSize;
    const requestsNeeded = Math.ceil(totalItems / avgItemsPerRequest);
    const estimatedTime = (requestsNeeded * this.requestMetrics.averageTime) + (requestsNeeded * this.config.requestDelay);
    
    if (estimatedTime < 60000) {
      return `${Math.round(estimatedTime / 1000)}s`;
    } else {
      return `${Math.round(estimatedTime / 60000)}m`;
    }
  }

  private generateContinuationToken<TParams, TResponse>(
    fetcher: DataFetcher<TParams, TResponse>,
    params: TParams,
    sampleResult: SmartPaginationResult<TResponse>
  ): string {
    const tokenData = {
      fetcher: fetcher.name,
      params,
      sampleResult,
      timestamp: Date.now()
    };
    
    return Buffer.from(JSON.stringify(tokenData)).toString('base64');
  }

  private parseContinuationToken(token: string): any {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error('Invalid continuation token');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // PUBLIC UTILITY METHODS
  // ============================================================================

  /**
   * Get current performance metrics
   */
  getMetrics() {
    return { ...this.requestMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.requestMetrics = {
      totalRequests: 0,
      totalTime: 0,
      averageTime: 0,
      errors: 0
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PaginationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// ============================================================================
// AFFISE-SPECIFIC IMPLEMENTATIONS
// ============================================================================

/**
 * Affise Offers Smart Pagination
 */
export class AffiseOffersPagination {
  public engine: SmartPaginationEngine;

  constructor(config: Partial<PaginationConfig> = {}) {
    this.engine = new SmartPaginationEngine({
      initialSampleSize: 50,
      largeDatasetThreshold: 500,
      ...config
    });
  }

  async searchOffers(
    apiConfig: { baseUrl: string; apiKey: string },
    searchParams: any,
    options: {
      userIntent?: 'explore' | 'analyze' | 'export';
      onProgress?: (progress: any) => void;
    } = {}
  ): Promise<SmartPaginationResult<any>> {
    const fetcher: DataFetcher = {
      name: 'affise_offers',
      fetch: async (request) => {
        // Import and call your existing searchAffiseOffers function
        const { searchAffiseOffers } = await import('./unified_affise_offers.js');
        const result = await searchAffiseOffers(apiConfig, {
          ...searchParams,
          page: request.page,
          limit: request.limit
        });
        
        if (result.status === 'error') {
          throw new Error(result.message);
        }
        
        return {
          data: result.data?.offers || [],
          pagination: result.pagination
        };
      }
    };

    return this.engine.paginate(fetcher, searchParams, options);
  }
}

/**
 * Affise Stats Smart Pagination
 */
export class AffiseStatsPagination {
  public engine: SmartPaginationEngine;

  constructor(config: Partial<PaginationConfig> = {}) {
    this.engine = new SmartPaginationEngine({
      initialSampleSize: 100,
      largeDatasetThreshold: 1000,
      ...config
    });
  }

  async getStats(
    apiConfig: { baseUrl: string; apiKey: string },
    statsParams: any,
    options: {
      userIntent?: 'explore' | 'analyze' | 'export';
      onProgress?: (progress: any) => void;
    } = {}
  ): Promise<SmartPaginationResult<any>> {
    const fetcher: DataFetcher = {
      name: 'affise_stats',
      fetch: async (request) => {
        // Import and call your existing getAffiseCustomStats function
        const { getAffiseCustomStats } = await import('./affise_custom_stats.js');
        const result = await getAffiseCustomStats(apiConfig, {
          ...statsParams,
          page: request.page,
          limit: request.limit
        });
        
        if (result.status === 'error') {
          throw new Error(result.message);
        }
        
        return {
          data: result.data?.stats || [],
          pagination: result.metadata?.page_info ? {
            page: result.metadata.page_info.current_page,
            limit: result.metadata.page_info.per_page,
            total: result.metadata.page_info.total_count,
            pages: result.metadata.page_info.total_pages
          } : undefined
        };
      }
    };

    return this.engine.paginate(fetcher, statsParams, options);
  }
}

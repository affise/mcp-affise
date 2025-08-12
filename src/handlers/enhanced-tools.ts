/**
 * Enhanced Tool Handler - Improved version of simple-tools.ts
 * Gradual enhancement with caching, error handling, and validation
 */

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Enhanced services
import { CacheService } from '../services/cache-service.js';
import { ErrorHandlerService } from '../services/error-handler-service.js';
import { ValidationService } from '../services/validation-service.js';

// Import API functions - UPDATED TO USE UNIFIED SYSTEM
import { createAffiseStatusTool } from '../tools/affise_status.js';
import { unifiedSearchOffers, searchWithNaturalLanguage } from '../tools/unified_affise_offers.js';
import { getAffiseCustomStats } from '../tools/affise_custom_stats.js';
import { getOfferCategories, searchCategoriesByTitle } from '../tools/affise_offer_categories.js';
import { getTrafficbackStats } from '../tools/affise_trafficback.js';

// Import existing parsers (keep current functionality)
import { parseQuery, toSearchParams, toStatsParams } from '../types/simple-parser.js';
import { OfferSearchResponse, StatsResponse, QueryInfo } from '../types/api-responses.js';
import { getDateRange } from '../shared/date-utils.js';

// Tool definitions (same as before)
export const TOOLS = [
  {
    name: 'affise_status',
    description: 'Check Affise API status',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'affise_search_offers',
    description: 'Search offers with natural language (IMPROVED VERSION) - Supports complex queries like "Find gaming offers for US mobile traffic", "Show me dating offers", "Search for finance offers in UK"',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query with automatic category resolution and country detection'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_stats',
    description: 'Get statistics with natural language (e.g., "Show me revenue by country last month")',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language stats query'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'affise_stats_raw',
    description: 'Get raw statistics with specific parameters',
    inputSchema: {
      type: 'object',
      properties: {
        slice: {
          type: 'array',
          items: { type: 'string' },
          description: 'Grouping dimensions (day, country, offer, etc.)'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Metrics to include (clicks, conversions, income, etc.)'
        },
        date_from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        date_to: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)'
        },
        period: {
          type: 'string',
          description: 'Quick period (today, yesterday, last7days, etc.)'
        },
        order: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to sort by'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 500)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_offer_categories',
    description: 'Get all available offer categories from Affise',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific category IDs to retrieve'
        },
        search: {
          type: 'string',
          description: 'Search term to filter categories by title'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 99999)'
        },
        order: {
          type: 'string',
          enum: ['id', 'title'],
          description: 'Sort field (default: id)'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: asc)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'affise_trafficback',
    description: 'Get trafficback statistics and analysis',
    inputSchema: {
      type: 'object',
      properties: {
        date_from: {
          type: 'string',
          description: 'Start date (YYYY-MM-DD)'
        },
        date_to: {
          type: 'string',
          description: 'End date (YYYY-MM-DD)'
        },
        period: {
          type: 'string',
          description: 'Quick period (today, yesterday, last7days, etc.)'
        },
        country: {
          type: 'array',
          items: { type: 'string' },
          description: 'Country codes to filter'
        },
        offer: {
          type: 'array',
          items: { type: 'number' },
          description: 'Offer IDs to filter'
        },
        advertiser: {
          type: 'array',
          items: { type: 'string' },
          description: 'Advertiser IDs to filter'
        },
        partner: {
          type: 'array',
          items: { type: 'string' },
          description: 'Partner IDs to filter'
        },
        device: {
          type: 'array',
          items: { type: 'string' },
          description: 'Device types to filter'
        },
        os: {
          type: 'array',
          items: { type: 'string' },
          description: 'Operating systems to filter'
        },
        page: {
          type: 'number',
          description: 'Page number (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Results per page (default: 100, max: 500)'
        },
        orderType: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction (default: desc)'
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: 'affise_smart_search',
    description: 'Intelligent offer search with automatic category resolution and suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g., "Find gaming offers for mobile traffic")'
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Category names or IDs to search in'
        },
        countries: {
          type: 'array',
          items: { type: 'string' },
          description: 'Country codes to filter'
        },
        auto_correct: {
          type: 'boolean',
          description: 'Enable automatic category name correction (default: true)'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
];

/**
 * Enhanced tool handler class
 */
export class EnhancedToolHandler {
  private cacheService: CacheService;
  private errorHandler: ErrorHandlerService;
  private validator: ValidationService;

  constructor(private config: { baseUrl: string; apiKey: string } | null) {
    // Initialize services
    this.cacheService = new CacheService({
      defaultTTL: 300000, // 5 minutes
      maxSize: 1000,
      cleanupInterval: 600000 // 10 minutes
    });
    
    this.errorHandler = new ErrorHandlerService();
    this.validator = new ValidationService();
  }

  /**
   * Execute tool with enhanced features
   */
  async executeTool(toolName: string, args: any): Promise<any> {
    const startTime = Date.now();
    
    try {
      // Validate tool exists
      if (!TOOLS.find(t => t.name === toolName)) {
        return this.errorHandler.createErrorResponse(
          `Unknown tool: ${toolName}`,
          'TOOL_NOT_FOUND',
          { toolName, args }
        );
      }

      // Validate configuration (except for status check)
      if (toolName !== 'affise_status' && !this.config) {
        return this.errorHandler.createErrorResponse(
          'Configuration not loaded',
          'CONFIG_MISSING',
          { toolName, args }
        );
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(toolName, args);
      
      // Check cache first
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        return {
          ...cachedResult,
          cache_info: {
            was_cached: true,
            cache_key: cacheKey,
            cache_performance: 'hit'
          }
        };
      }

      // Execute tool with current logic
      const result = await this.executeToolHandler(toolName, args);

      // Cache successful results
      if (result.status === 'ok') {
        const ttl = this.getCacheTTL(toolName);
        await this.cacheService.set(cacheKey, result, ttl);
      }

      // Add cache info and performance metrics
      const responseTime = Date.now() - startTime;
      return {
        ...result,
        cache_info: {
          was_cached: false,
          cache_key: cacheKey,
          cache_performance: 'miss'
        },
        performance: {
          response_time: responseTime,
          cache_stats: this.cacheService.getStats()
        }
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        error.message,
        'UNKNOWN_ERROR',
        { toolName, args },
        error
      );
    }
  }

  /**
   * Execute tool handler (keeps existing logic)
   */
  private async executeToolHandler(toolName: string, args: any): Promise<any> {
    switch (toolName) {
      case 'affise_status':
        return await this.handleStatus();
        
      case 'affise_search_offers':
        return await this.handleOfferSearch(args.query);
        
      case 'affise_stats':
        return await this.handleStatsNL(args.query);
        
      case 'affise_stats_raw':
        return await this.handleStatsRaw(args);
        
      case 'affise_offer_categories':
        return await this.handleOfferCategories(args);
        
      case 'affise_trafficback':
        return await this.handleTrafficback(args);
        
      case 'affise_smart_search':
        return await this.handleSmartSearch(args);
        
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  /**
   * Handle status check (enhanced with validation)
   */
  private async handleStatus(): Promise<any> {
    if (!this.config) {
      return {
        status: 'error',
        message: 'No configuration provided',
        timestamp: new Date().toISOString()
      };
    }
    
    try {
      const result = await createAffiseStatusTool(this.config);
      return {
        status: result.status,
        message: result.message,
        data: result,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        error.message,
        'NETWORK_ERROR',
        { toolName: 'affise_status' },
        error
      );
    }
  }

  /**
   * Handle offer search - UPDATED TO USE UNIFIED SYSTEM
   */
  private async handleOfferSearch(query: string): Promise<OfferSearchResponse> {
    // Validate input
    const validation = this.validator.validateOfferSearch({ query });
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_search_offers', args: { query } }
      );
    }

    try {
      // Use unified search system with natural language query
      const result = await searchWithNaturalLanguage(this.config!, query, {
        userIntent: 'explore',
        maxSampleSize: 50
      });
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'SEARCH_ERROR',
          { toolName: 'affise_search_offers', args: { query } }
        );
      }

      return {
        status: 'ok',
        message: result.message || `Found ${result.itemsRetrieved || 0} offers`,
        offers: result.data || [],
        total_found: result.totalItems || 0,
        has_more_results: result.canContinue || false,
        query_parsed: result.query_parsed,
        search_type: result.search_type,
        insights: result.insights,
        recommendations: result.recommendations,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Search error: ${error.message}`,
        'SEARCH_ERROR',
        { toolName: 'affise_search_offers', args: { query } },
        error
      );
    }
  }

  /**
   * Handle stats with natural language (enhanced)
   */
  private async handleStatsNL(query: string): Promise<StatsResponse> {
    // Validate input
    const validation = this.validator.validateStatsQuery({ query });
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_stats', args: { query } }
      );
    }

    try {
      // Use existing logic with enhancements
      const parsed = parseQuery(query);
      const statsParams = toStatsParams(parsed);
      
      // Handle date range
      if (parsed.time_period) {
        const dateRange = getDateRange(parsed.time_period as any);
        statsParams.date_from = dateRange.from;
        statsParams.date_to = dateRange.to;
      } else {
        const dateRange = getDateRange('last7days');
        statsParams.date_from = dateRange.from;
        statsParams.date_to = dateRange.to;
      }
      
      const result = await getAffiseCustomStats(this.config!, statsParams);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'STATS_ERROR',
          { toolName: 'affise_stats', args: { query } }
        );
      }

      return {
        status: 'ok',
        message: 'Stats retrieved successfully',
        data: result.data,
        summary: result.data?.stats ? this.calculateSummary(result.data.stats) : undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Stats error: ${error.message}`,
        'STATS_ERROR',
        { toolName: 'affise_stats', args: { query } },
        error
      );
    }
  }

  /**
   * Handle raw stats (enhanced with validation)
   */
  private async handleStatsRaw(params: any): Promise<StatsResponse> {
    // Validate and normalize parameters
    const validation = this.validator.validateRawStatsParams(params);
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_stats_raw', args: params }
      );
    }

    try {
      const normalizedParams = this.validator.normalizeStatsParams(params);
      const result = await getAffiseCustomStats(this.config!, normalizedParams as any);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'STATS_ERROR',
          { toolName: 'affise_stats_raw', args: params }
        );
      }

      return {
        status: 'ok',
        message: 'Raw stats retrieved successfully',
        data: result.data,
        summary: result.data?.stats ? this.calculateSummary(result.data.stats) : undefined,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Raw stats error: ${error.message}`,
        'STATS_ERROR',
        { toolName: 'affise_stats_raw', args: params },
        error
      );
    }
  }

  /**
   * Handle offer categories (keep existing logic)
   */
  private async handleOfferCategories(args: any): Promise<any> {
    try {
      const params: any = {
        page: args.page || 1,
        limit: args.limit || 100,
        order: args.order || 'id',
        orderType: args.orderType || 'asc'
      };
      
      if (args.ids && Array.isArray(args.ids)) {
        params.ids = args.ids;
      }
      
      const result = await getOfferCategories(this.config!, params);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'CATEGORIES_ERROR',
          { toolName: 'affise_offer_categories', args }
        );
      }
      
      let categories = result.data?.categories || [];
      
      // Apply search filter if provided
      if (args.search && typeof args.search === 'string') {
        categories = searchCategoriesByTitle(categories, args.search);
      }
      
      return {
        status: 'ok',
        message: `Found ${categories.length} categories`,
        data: {
          categories,
          total: categories.length,
          search_applied: args.search || null
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Categories error: ${error.message}`,
        'CATEGORIES_ERROR',
        { toolName: 'affise_offer_categories', args },
        error
      );
    }
  }

  /**
   * Handle trafficback (keep existing logic)
   */
  private async handleTrafficback(args: any): Promise<any> {
    try {
      // Handle date range
      let dateFrom = args.date_from;
      let dateTo = args.date_to;
      
      if (args.period) {
        const dateRange = getDateRange(args.period);
        dateFrom = dateRange.from;
        dateTo = dateRange.to;
      } else if (!dateFrom || !dateTo) {
        const dateRange = getDateRange('last7days');
        dateFrom = dateRange.from;
        dateTo = dateRange.to;
      }
      
      const params: any = {
        date_from: dateFrom,
        date_to: dateTo,
        page: args.page || 1,
        limit: args.limit || 100,
        orderType: args.orderType || 'desc'
      };
      
      // Add optional filters
      const filterFields = ['country', 'offer', 'advertiser', 'partner', 'device', 'os'];
      filterFields.forEach(field => {
        if (args[field] && Array.isArray(args[field])) {
          params[field] = args[field];
        }
      });
      
      const result = await getTrafficbackStats(this.config!, params);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'TRAFFICBACK_ERROR',
          { toolName: 'affise_trafficback', args }
        );
      }
      
      return {
        status: 'ok',
        message: result.message || 'Trafficback stats retrieved successfully',
        data: result.data,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Trafficback error: ${error.message}`,
        'TRAFFICBACK_ERROR',
        { toolName: 'affise_trafficback', args },
        error
      );
    }
  }

  /**
   * Handle smart search - UPDATED TO USE UNIFIED SYSTEM
   */
  private async handleSmartSearch(args: any): Promise<any> {
    // Validate input
    const validation = this.validator.validateSmartSearch(args);
    if (!validation.isValid) {
      return this.errorHandler.createErrorResponse(
        validation.errors.join(', '),
        'VALIDATION_ERROR',
        { toolName: 'affise_smart_search', args }
      );
    }

    try {
      // Build unified search parameters
      const searchParams: any = {
        query: args.query
      };
      
      // Add structured parameters if provided
      if (args.categories || args.countries) {
        searchParams.structured = {};
        
        if (args.categories && Array.isArray(args.categories)) {
          searchParams.structured.categories = args.categories;
        }
        
        if (args.countries && Array.isArray(args.countries)) {
          searchParams.structured.countries = args.countries;
        }
      }
      
      // Set search options
      searchParams.options = {
        userIntent: 'analyze',
        maxSampleSize: 100,
        autoComplete: false
      };
      
      const result = await unifiedSearchOffers(this.config!, searchParams);
      
      if (result.status === 'error') {
        return this.errorHandler.createErrorResponse(
          result.message,
          'SEARCH_ERROR',
          { toolName: 'affise_smart_search', args }
        );
      }
      
      return {
        status: 'ok',
        message: result.message || 'Smart search completed successfully',
        data: {
          offers: result.data || [],
          total_found: result.totalItems || 0,
          search_type: result.search_type,
          query_parsed: result.query_parsed,
          insights: result.insights,
          recommendations: result.recommendations,
          can_continue: result.canContinue || false
        },
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      return this.errorHandler.createErrorResponse(
        `Smart search error: ${error.message}`,
        'SEARCH_ERROR',
        { toolName: 'affise_smart_search', args },
        error
      );
    }
  }

  /**
   * Calculate summary metrics (keep existing logic)
   */
  private calculateSummary(stats: any[]): { total_records: number; key_metrics: Record<string, number> } {
    if (!stats || stats.length === 0) {
      return {
        total_records: 0,
        key_metrics: {}
      };
    }
    
    const totals = stats.reduce((acc, stat) => {
      acc.revenue += parseFloat(stat.income) || 0;
      acc.conversions += parseInt(stat.conversions) || 0;
      acc.clicks += parseInt(stat.clicks) || 0;
      return acc;
    }, { revenue: 0, conversions: 0, clicks: 0 });
    
    return {
      total_records: stats.length,
      key_metrics: {
        total_revenue: totals.revenue,
        total_conversions: totals.conversions,
        total_clicks: totals.clicks,
        conversion_rate: totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0
      }
    };
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(toolName: string, args: any): string {
    const sortedArgs = JSON.stringify(args, Object.keys(args || {}).sort());
    return `${toolName}:${this.hashString(sortedArgs)}`;
  }

  /**
   * Get cache TTL for specific tool
   */
  private getCacheTTL(toolName: string): number {
    const cacheTTLs: Record<string, number> = {
      'affise_status': 60000,           // 1 minute
      'affise_offer_categories': 600000, // 10 minutes
      'affise_search_offers': 300000,   // 5 minutes
      'affise_stats': 180000,           // 3 minutes
      'affise_stats_raw': 180000,       // 3 minutes
      'affise_trafficback': 300000,     // 5 minutes
      'affise_smart_search': 300000     // 5 minutes
    };
    
    return cacheTTLs[toolName] || 300000; // Default 5 minutes
  }

  /**
   * Simple hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Get performance metrics
   */
  getMetrics(): any {
    return {
      cache: this.cacheService.getStats(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.cacheService.destroy();
  }
}

/**
 * Setup enhanced handlers (drop-in replacement)
 */
export function setupEnhancedHandlers(
  server: Server, 
  config: { baseUrl: string; apiKey: string } | null
): void {
  const toolHandler = new EnhancedToolHandler(config);

  // List tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    try {
      const result = await toolHandler.executeTool(name, args || {});
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
      
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'error',
            message: `Unexpected error: ${error.message}`,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }
  });
}

/**
 * Legacy compatibility
 */
export function setupSimpleHandlers(
  server: Server, 
  config: { baseUrl: string; apiKey: string } | null
): void {
  setupEnhancedHandlers(server, config);
}

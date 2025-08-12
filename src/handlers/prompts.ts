import { GetPromptRequestSchema, ListPromptsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createOfferAnalysisPrompt } from '../prompts/offer_analysis.js';
import { createWorkflowAnalysisPrompt } from '../prompts/workflow_analysis.js';
import { createAutoAnalysisPrompt } from '../prompts/auto_analysis.js';
import { createStatsAnalysisPrompt } from '../prompts/stats_analysis.js';
import { createTrafficbackAnalysisPrompt } from '../prompts/trafficback_analysis.js';
import { SliceType, FieldType, ConversionType } from '../tools/affise_custom_stats.js';

export function setupPromptHandlers(server: Server, config: { baseUrl: string; apiKey: string } | null) {
  // Prompt list handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: 'analyze_offers',
          description: 'Analyze Affise offers data with expert recommendations',
          arguments: [
            {
              name: 'offers_data',
              description: 'JSON offers data for analysis',
              required: true
            },
            {
              name: 'analysis_type',
              description: 'Analysis type: comprehensive, performance, market, technical, competitive, compliance',
              required: false
            },
            {
              name: 'focus_areas',
              description: 'Array of focus areas',
              required: false
            },
            {
              name: 'comparison_criteria',
              description: 'Criteria for comparing offers',
              required: false
            },
            {
              name: 'format',
              description: 'Output format: summary, detailed, actionable',
              required: false
            }
          ]
        },
        {
          name: 'analyze_trafficback',
          description: 'Analyze Affise trafficback data with expert insights and optimization recommendations',
          arguments: [
            {
              name: 'trafficback_data',
              description: 'JSON trafficback data for analysis',
              required: true
            },
            {
              name: 'analysis_type',
              description: 'Analysis type: comprehensive, geo, reason, partner, advertiser, technical, goal',
              required: false
            },
            {
              name: 'focus_areas',
              description: 'Array of focus areas (e.g., ["geo_issues", "device_targeting", "partner_quality"])',
              required: false
            },
            {
              name: 'comparison_criteria',
              description: 'Criteria for comparing trafficback patterns',
              required: false
            },
            {
              name: 'format',
              description: 'Output format: summary, detailed, actionable',
              required: false
            }
          ]
        },
        {
          name: 'analyze_stats',
          description: 'Analyze Affise statistics data with comprehensive performance insights',
          arguments: [
            {
              name: 'slice',
              description: 'Array of data slicing options',
              required: false
            },
            {
              name: 'date_from',
              description: 'Start date (YYYY-MM-DD format)',
              required: false
            },
            {
              name: 'date_to',
              description: 'End date (YYYY-MM-DD format)',
              required: false
            },
            {
              name: 'period',
              description: 'Quick date range',
              required: false
            },
            {
              name: 'fields',
              description: 'Array of metrics to include',
              required: false
            },
            {
              name: 'currency',
              description: 'Array of currency codes',
              required: false
            },
            {
              name: 'country',
              description: 'Array of country codes',
              required: false
            },
            {
              name: 'offer',
              description: 'Array of offer IDs',
              required: false
            },
            {
              name: 'advertiser',
              description: 'Array of advertiser IDs',
              required: false
            },
            {
              name: 'timezone',
              description: 'Timezone',
              required: false
            },
            {
              name: 'limit',
              description: 'Maximum number of records',
              required: false
            },
            {
              name: 'preset',
              description: 'Quick preset',
              required: false
            },
            {
              name: 'analysis_type',
              description: 'Analysis type',
              required: false
            },
            {
              name: 'focus_metrics',
              description: 'Array of specific metrics to focus on',
              required: false
            },
            {
              name: 'comparison_period',
              description: 'Period to compare against',
              required: false
            },
            {
              name: 'format',
              description: 'Output format',
              required: false
            },
            {
              name: 'kpi_targets',
              description: 'KPI targets object',
              required: false
            }
          ]
        },
        {
          name: 'workflow_analysis',
          description: 'Complete workflow: search offers and analyze them step by step',
          arguments: [
            {
              name: 'search_query',
              description: 'Search query for offers',
              required: false
            },
            {
              name: 'countries',
              description: 'Array of country codes to filter',
              required: false
            },
            {
              name: 'status',
              description: 'Array of offer statuses',
              required: false
            },
            {
              name: 'analysis_type',
              description: 'Type of analysis to perform',
              required: false
            },
            {
              name: 'focus_areas',
              description: 'Array of areas to focus analysis on',
              required: false
            }
          ]
        },
        {
          name: 'auto_analysis',
          description: 'Enhanced auto-analysis: offers, stats, trafficback data with comprehensive insights',
          arguments: [
            // Data type selection
            {
              name: 'data_type',
              description: 'Data type: offers, stats, trafficback, combined (default: offers)',
              required: false
            },
            
            // Offer parameters
            {
              name: 'search_query',
              description: 'Search query for offers',
              required: false
            },
            {
              name: 'offer_countries',
              description: 'Array of country codes for offer filtering',
              required: false
            },
            {
              name: 'offer_status',
              description: 'Array of offer statuses (default: ["active"])',
              required: false
            },
            {
              name: 'offer_categories',
              description: 'Array of offer categories',
              required: false
            },
            
            // Stats parameters
            {
              name: 'slice',
              description: 'Array of stats slicing dimensions (e.g., ["day", "country", "offer"])',
              required: false
            },
            {
              name: 'date_from',
              description: 'Start date for stats (YYYY-MM-DD)',
              required: false
            },
            {
              name: 'date_to',
              description: 'End date for stats (YYYY-MM-DD)',
              required: false
            },
            {
              name: 'period',
              description: 'Quick date range: today, yesterday, last7days, last30days, thismonth, lastmonth',
              required: false
            },
            {
              name: 'stats_fields',
              description: 'Array of stats metrics (e.g., ["views", "clicks", "conversions", "earnings"])',
              required: false
            },
            {
              name: 'conversionTypes',
              description: 'Array of conversion types: total, confirmed, pending, declined',
              required: false
            },
            {
              name: 'currency',
              description: 'Array of currency codes',
              required: false
            },
            {
              name: 'advertiser',
              description: 'Array of advertiser IDs',
              required: false
            },
            {
              name: 'affiliate',
              description: 'Array of affiliate IDs',
              required: false
            },
            {
              name: 'offer',
              description: 'Array of offer IDs for stats filtering',
              required: false
            },
            {
              name: 'country',
              description: 'Array of country codes for stats filtering',
              required: false
            },
            {
              name: 'os',
              description: 'Array of operating systems',
              required: false
            },
            {
              name: 'device',
              description: 'Array of device types',
              required: false
            },
            {
              name: 'browser',
              description: 'Array of browser types',
              required: false
            },
            {
              name: 'sub1',
              description: 'Array of sub1 tracking values',
              required: false
            },
            {
              name: 'sub2',
              description: 'Array of sub2 tracking values',
              required: false
            },
            {
              name: 'sub3',
              description: 'Array of sub3 tracking values',
              required: false
            },
            {
              name: 'sub4',
              description: 'Array of sub4 tracking values',
              required: false
            },
            {
              name: 'sub5',
              description: 'Array of sub5 tracking values',
              required: false
            },
            {
              name: 'sub6',
              description: 'Array of sub6 tracking values',
              required: false
            },
            {
              name: 'sub7',
              description: 'Array of sub7 tracking values',
              required: false
            },
            {
              name: 'sub8',
              description: 'Array of sub8 tracking values',
              required: false
            },
            {
              name: 'nonzero',
              description: 'Non-zero conversions only (0 or 1)',
              required: false
            },
            {
              name: 'preset',
              description: 'Stats preset: monthlyByOffer, performanceByCountry, funnelAnalysis, etc.',
              required: false
            },
            
            // Trafficback parameters
            {
              name: 'trafficback_countries',
              description: 'Array of countries for trafficback analysis',
              required: false
            },
            {
              name: 'trafficback_offers',
              description: 'Array of offers for trafficback analysis',
              required: false
            },
            {
              name: 'trafficback_devices',
              description: 'Array of devices for trafficback analysis',
              required: false
            },
            {
              name: 'trafficback_os',
              description: 'Array of OS for trafficback analysis',
              required: false
            },
            
            // Analysis configuration
            {
              name: 'analysis_type',
              description: 'Analysis type: comprehensive, performance, revenue, quality, geographic, technical, funnel, partner, competitive, optimization',
              required: false
            },
            {
              name: 'focus_areas',
              description: 'Array of focus areas for detailed analysis',
              required: false
            },
            {
              name: 'format',
              description: 'Output format: summary, detailed, actionable, executive',
              required: false
            },
            {
              name: 'comparison_period',
              description: 'Period to compare performance against',
              required: false
            },
            {
              name: 'kpi_targets',
              description: 'KPI targets object for performance evaluation',
              required: false
            },
            
            // Pagination and limits
            {
              name: 'page',
              description: 'Page number for pagination',
              required: false
            },
            {
              name: 'limit',
              description: 'Maximum number of records to retrieve',
              required: false
            },
            {
              name: 'orderType',
              description: 'Sort direction: asc or desc',
              required: false
            },
            {
              name: 'timezone',
              description: 'Timezone for data analysis',
              required: false
            }
          ]
        }
      ]
    };
  });

  // Prompt get handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    if (request.params.name === 'analyze_offers') {
      const args = request.params.arguments || {};
      
      if (!args.offers_data) {
        throw new Error('offers_data argument is required');
      }
      
      const validFormats = ['summary', 'detailed', 'actionable'] as const;
      const format = validFormats.includes(args.format as any) ? args.format as 'summary' | 'detailed' | 'actionable' : undefined;
      
      return createOfferAnalysisPrompt({
        offers_data: args.offers_data,
        analysis_type: args.analysis_type,
        focus_areas: args.focus_areas ? (Array.isArray(args.focus_areas) ? args.focus_areas : [args.focus_areas]) : undefined,
        comparison_criteria: args.comparison_criteria,
        format: format
      });
    }

    if (request.params.name === 'analyze_trafficback') {
      const args = request.params.arguments || {};
      
      if (!args.trafficback_data) {
        throw new Error('trafficback_data argument is required');
      }
      
      const validFormats = ['summary', 'detailed', 'actionable'] as const;
      const format = validFormats.includes(args.format as any) ? args.format as 'summary' | 'detailed' | 'actionable' : undefined;
      
      const validAnalysisTypes = ['comprehensive', 'geo', 'reason', 'partner', 'advertiser', 'technical', 'goal'] as const;
      const analysis_type = validAnalysisTypes.includes(args.analysis_type as any) ? args.analysis_type as 'comprehensive' | 'geo' | 'reason' | 'partner' | 'advertiser' | 'technical' | 'goal' : undefined;
      
      return createTrafficbackAnalysisPrompt({
        trafficback_data: args.trafficback_data,
        analysis_type: analysis_type,
        focus_areas: args.focus_areas ? (Array.isArray(args.focus_areas) ? args.focus_areas : [args.focus_areas]) : undefined,
        comparison_criteria: args.comparison_criteria,
        format: format
      });
    }

    if (request.params.name === 'analyze_stats') {
      const args = request.params.arguments || {};
      
      const validFormats = ['summary', 'detailed', 'actionable', 'executive'] as const;
      const format = validFormats.includes(args.format as any) ? args.format as 'summary' | 'detailed' | 'actionable' | 'executive' : undefined;
      
      // Parse KPI targets if provided
      let kpiTargets: { conversion_rate?: number; epc?: number; revenue_target?: number } | undefined;
      if (args.kpi_targets && typeof args.kpi_targets === 'object') {
        kpiTargets = args.kpi_targets as { conversion_rate?: number; epc?: number; revenue_target?: number };
      }
      
      // Validate and cast types for period
      const validPeriods = ['today', 'yesterday', 'last7days', 'last30days', 'thismonth', 'lastmonth'] as const;
      const period = validPeriods.includes(args.period as any) ? args.period as 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thismonth' | 'lastmonth' : undefined;
      
      return createStatsAnalysisPrompt({
        // Custom stats parameters
        slice: args.slice ? (Array.isArray(args.slice) ? args.slice as SliceType[] : [args.slice as SliceType]) : undefined,
        date_from: args.date_from as string | undefined,
        date_to: args.date_to as string | undefined,
        period: period,
        fields: args.fields ? (Array.isArray(args.fields) ? args.fields as FieldType[] : [args.fields as FieldType]) : undefined,
        currency: args.currency ? (Array.isArray(args.currency) ? args.currency : [args.currency]) : undefined,
        timezone: args.timezone as string | undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        
        // Filter parameters
        country: args.country ? (Array.isArray(args.country) ? args.country : [args.country]) : undefined,
        offer: args.offer ? (Array.isArray(args.offer) ? args.offer.map(Number) : [Number(args.offer)]) : undefined,
        advertiser: args.advertiser ? (Array.isArray(args.advertiser) ? args.advertiser : [args.advertiser]) : undefined,
        advertiser_manager_id: args.advertiser_manager_id ? (Array.isArray(args.advertiser_manager_id) ? args.advertiser_manager_id : [args.advertiser_manager_id]) : undefined,
        affiliate: args.affiliate ? (Array.isArray(args.affiliate) ? args.affiliate : [args.affiliate]) : undefined,
        affiliate_manager_id: args.affiliate_manager_id ? (Array.isArray(args.affiliate_manager_id) ? args.affiliate_manager_id : [args.affiliate_manager_id]) : undefined,
        city: args.city ? (Array.isArray(args.city) ? args.city : [args.city]) : undefined,
        os: args.os ? (Array.isArray(args.os) ? args.os : [args.os]) : undefined,
        os_version: args.os_version ? (Array.isArray(args.os_version) ? args.os_version : [args.os_version]) : undefined,
        browser: args.browser ? (Array.isArray(args.browser) ? args.browser : [args.browser]) : undefined,
        browser_version: args.browser_version ? (Array.isArray(args.browser_version) ? args.browser_version : [args.browser_version]) : undefined,
        device: args.device ? (Array.isArray(args.device) ? args.device : [args.device]) : undefined,
        device_model: args.device_model ? (Array.isArray(args.device_model) ? args.device_model : [args.device_model]) : undefined,
        conn_type: args.conn_type ? (Array.isArray(args.conn_type) ? args.conn_type : [args.conn_type]) : undefined,
        isp: args.isp ? (Array.isArray(args.isp) ? args.isp : [args.isp]) : undefined,
        landing: args.landing ? (Array.isArray(args.landing) ? args.landing : [args.landing]) : undefined,
        prelanding: args.prelanding ? (Array.isArray(args.prelanding) ? args.prelanding : [args.prelanding]) : undefined,
        smart_id: args.smart_id ? (Array.isArray(args.smart_id) ? args.smart_id : [args.smart_id]) : undefined,
        sub1: args.sub1 ? (Array.isArray(args.sub1) ? args.sub1 : [args.sub1]) : undefined,
        sub2: args.sub2 ? (Array.isArray(args.sub2) ? args.sub2 : [args.sub2]) : undefined,
        sub3: args.sub3 ? (Array.isArray(args.sub3) ? args.sub3 : [args.sub3]) : undefined,
        sub4: args.sub4 ? (Array.isArray(args.sub4) ? args.sub4 : [args.sub4]) : undefined,
        sub5: args.sub5 ? (Array.isArray(args.sub5) ? args.sub5 : [args.sub5]) : undefined,
        sub6: args.sub6 ? (Array.isArray(args.sub6) ? args.sub6 : [args.sub6]) : undefined,
        sub7: args.sub7 ? (Array.isArray(args.sub7) ? args.sub7 : [args.sub7]) : undefined,
        sub8: args.sub8 ? (Array.isArray(args.sub8) ? args.sub8 : [args.sub8]) : undefined,
        goal: args.goal ? (Array.isArray(args.goal) ? args.goal : [args.goal]) : undefined,
        trafficback_reason: args.trafficback_reason ? (Array.isArray(args.trafficback_reason) ? args.trafficback_reason : [args.trafficback_reason]) : undefined,
        conversionTypes: args.conversionTypes ? (Array.isArray(args.conversionTypes) ? args.conversionTypes as ConversionType[] : [args.conversionTypes as ConversionType]) : undefined,
        nonzero: args.nonzero !== undefined ? (Number(args.nonzero) === 1 ? 1 : 0) : undefined,
        page: typeof args.page === 'number' ? args.page : undefined,
        orderType: args.orderType as 'asc' | 'desc' | undefined,
        order: args.order ? (Array.isArray(args.order) ? args.order : [args.order]) : undefined,
        locale: args.locale as 'en' | 'ru' | 'es' | undefined,
        preset: args.preset as string | undefined,
        
        // Analysis parameters
        analysis_type: args.analysis_type as string | undefined,
        focus_metrics: args.focus_metrics ? (Array.isArray(args.focus_metrics) ? args.focus_metrics : [args.focus_metrics]) : undefined,
        comparison_period: args.comparison_period as string | undefined,
        format: format,
        kpi_targets: kpiTargets
      });
    }
    
    if (request.params.name === 'workflow_analysis') {
      const args = request.params.arguments || {};
      
      const countries = Array.isArray(args.countries) ? args.countries : (args.countries ? [args.countries] : []);
      const status = Array.isArray(args.status) ? args.status : (args.status ? [args.status] : ['active']);
      const focus_areas = Array.isArray(args.focus_areas) ? args.focus_areas : (args.focus_areas ? [args.focus_areas] : []);
      
      return createWorkflowAnalysisPrompt({
        search_query: args.search_query,
        countries: countries,
        status: status,
        analysis_type: args.analysis_type,
        focus_areas: focus_areas
      });
    }
    
    if (request.params.name === 'auto_analysis') {
      const args = request.params.arguments || {};
      
      if (!config) {
        throw new Error('Configuration not loaded - cannot execute auto analysis');
      }
      
      // Helper function to ensure array
      const ensureArray = (value: any): string[] => 
        Array.isArray(value) ? value : (value ? [value] : []);
      
      const ensureNumberArray = (value: any): number[] => 
        Array.isArray(value) ? value.map(Number) : (value ? [Number(value)] : []);

      // Validate format
      const validFormats = ['summary', 'detailed', 'actionable', 'executive'] as const;
      const format = validFormats.includes(args.format as any) ? args.format as 'summary' | 'detailed' | 'actionable' | 'executive' : undefined;
      
      // Validate data type
      const validDataTypes = ['offers', 'stats', 'trafficback', 'combined'] as const;
      const data_type = validDataTypes.includes(args.data_type as any) ? args.data_type as 'offers' | 'stats' | 'trafficback' | 'combined' : 'offers';
      
      // Validate period
      const validPeriods = ['today', 'yesterday', 'last7days', 'last30days', 'thismonth', 'lastmonth'] as const;
      const period = validPeriods.includes(args.period as any) ? args.period as 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thismonth' | 'lastmonth' : undefined;
      
      // Parse KPI targets
      let kpiTargets: { conversion_rate?: number; epc?: number; revenue_target?: number; ecpm_target?: number; approval_rate?: number } | undefined;
      if (args.kpi_targets && typeof args.kpi_targets === 'object') {
        kpiTargets = args.kpi_targets as { conversion_rate?: number; epc?: number; revenue_target?: number; ecpm_target?: number; approval_rate?: number };
      }
      
      return await createAutoAnalysisPrompt({
        // Data type selection
        data_type: data_type,
        
        // Offer parameters
        search_query: args.search_query,
        offer_countries: ensureArray(args.offer_countries),
        offer_status: ensureArray(args.offer_status),
        offer_categories: ensureArray(args.offer_categories),
        
        // Stats parameters
        slice: args.slice ? (Array.isArray(args.slice) ? args.slice as SliceType[] : [args.slice as SliceType]) : undefined,
        date_from: args.date_from,
        date_to: args.date_to,
        period: period,
        stats_fields: args.stats_fields ? (Array.isArray(args.stats_fields) ? args.stats_fields as FieldType[] : [args.stats_fields as FieldType]) : undefined,
        conversionTypes: args.conversionTypes ? (Array.isArray(args.conversionTypes) ? args.conversionTypes as ConversionType[] : [args.conversionTypes as ConversionType]) : undefined,
        currency: ensureArray(args.currency),
        advertiser: ensureArray(args.advertiser),
        affiliate: ensureArray(args.affiliate),
        offer: ensureNumberArray(args.offer),
        country: ensureArray(args.country),
        os: ensureArray(args.os),
        device: ensureArray(args.device),
        browser: ensureArray(args.browser),
        sub1: ensureArray(args.sub1),
        sub2: ensureArray(args.sub2),
        sub3: ensureArray(args.sub3),
        sub4: ensureArray(args.sub4),
        sub5: ensureArray(args.sub5),
        sub6: ensureArray(args.sub6),
        sub7: ensureArray(args.sub7),
        sub8: ensureArray(args.sub8),
        nonzero: args.nonzero !== undefined ? (Number(args.nonzero) === 1 ? 1 : 0) : undefined,
        preset: args.preset,
        
        // Trafficback parameters
        trafficback_countries: ensureArray(args.trafficback_countries),
        trafficback_offers: ensureNumberArray(args.trafficback_offers),
        trafficback_devices: ensureArray(args.trafficback_devices),
        trafficback_os: ensureArray(args.trafficback_os),
        
        // Analysis configuration
        analysis_type: args.analysis_type,
        focus_areas: ensureArray(args.focus_areas),
        format: format,
        comparison_period: args.comparison_period,
        kpi_targets: kpiTargets,
        
        // Pagination and limits
        page: typeof args.page === 'number' ? args.page : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        orderType: args.orderType as 'asc' | 'desc' | undefined,
        timezone: args.timezone,
        
        config: config
      });
    }
    
    throw new Error(`Unknown prompt: ${request.params.name}`);
  });
}

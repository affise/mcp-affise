import { searchAffiseOffers, smartSearchAffiseOffers } from '../tools/unified_affise_offers.js';
import { getAffiseCustomStats, smartGetAffiseStats, createCustomStatsPresets, SliceType, FieldType, ConversionType } from '../tools/affise_custom_stats.js';
import { getTrafficbackStats, createTrafficbackPresets } from '../tools/affise_trafficback.js';
import { formatSmartOffersResult, formatSmartStatsResult } from '../tools/smart_pagination_formatters.js';

export interface AutoAnalysisParams {
  // === DATA TYPE SELECTION ===
  data_type?: 'offers' | 'stats' | 'trafficback' | 'combined';
  
  // === OFFER SEARCH PARAMETERS ===
  search_query?: string;
  offer_countries?: string[];
  offer_status?: string[];
  offer_categories?: string[];
  
  // === STATS PARAMETERS ===
  slice?: SliceType[];
  date_from?: string;
  date_to?: string;
  period?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thismonth' | 'lastmonth';
  
  // Stats filters
  stats_fields?: FieldType[];
  conversionTypes?: ConversionType[];
  currency?: string[];
  advertiser?: string[];
  affiliate?: string[];
  offer?: number[];
  country?: string[];
  os?: string[];
  device?: string[];
  browser?: string[];
  sub1?: string[];
  sub2?: string[];
  sub3?: string[];
  sub4?: string[];
  sub5?: string[];
  sub6?: string[];
  sub7?: string[];
  sub8?: string[];
  nonzero?: 0 | 1;
  preset?: string;
  
  // === TRAFFICBACK PARAMETERS ===
  trafficback_countries?: string[];
  trafficback_offers?: number[];
  trafficback_devices?: string[];
  trafficback_os?: string[];
  
  // === ANALYSIS CONFIGURATION ===
  analysis_type?: string;
  focus_areas?: string[];
  format?: 'summary' | 'detailed' | 'actionable' | 'executive';
  comparison_period?: string;
  kpi_targets?: {
    conversion_rate?: number;
    epc?: number;
    revenue_target?: number;
    ecpm_target?: number;
    approval_rate?: number;
  };
  
  // === PAGINATION & LIMITS ===
  page?: number;
  limit?: number;
  orderType?: 'asc' | 'desc';
  timezone?: string;
  
  config: { baseUrl: string; apiKey: string };
}

export async function createAutoAnalysisPrompt(params: AutoAnalysisParams) {
  const {
    data_type = 'offers',
    search_query = '',
    offer_countries = [],
    offer_status = ['active'],
    offer_categories = [],
    slice = ['day'],
    date_from,
    date_to,
    period,
    stats_fields = ['views', 'clicks', 'conversions', 'earnings', 'income', 'payouts', 'cr', 'epc', 'ecpm'],
    conversionTypes = ['total', 'confirmed', 'pending', 'declined'],
    currency,
    advertiser,
    affiliate,
    offer,
    country,
    os,
    device,
    browser,
    sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8,
    nonzero,
    preset,
    trafficback_countries,
    trafficback_offers,
    trafficback_devices,
    trafficback_os,
    analysis_type = 'comprehensive',
    focus_areas = [],
    format = 'detailed',
    comparison_period,
    kpi_targets,
    page = 1,
    limit = 100,
    orderType = 'desc',
    timezone = 'UTC',
    config
  } = params;

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.info('=== AUTO ANALYSIS PROMPT ===');
    console.info('Data type:', data_type);
    console.info('Parameters:', { search_query, date_from, date_to, period, preset });
  }

  try {
    let offersData = null;
    let statsData = null;
    let trafficbackData = null;
    let errors: string[] = [];

    // === FETCH OFFERS DATA WITH SMART PAGINATION ===
    if (data_type === 'offers' || data_type === 'combined') {
      try {
        const offersResult = await smartSearchAffiseOffers(config, {
          q: search_query,
          countries: offer_countries,
          status: offer_status,
          categories: offer_categories
        }, {
          userIntent: analysis_type === 'comprehensive' ? 'analyze' : 'explore',
          autoComplete: format === 'executive' // Auto-complete for executive reports
        });

        if (offersResult.status === 'user_confirmation_required') {
          return {
            messages: [{
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `📊 **LARGE OFFERS DATASET DETECTED**

${offersResult.message}

**Sample Analysis Available:**
- ${offersResult.data.length} offers in sample
- ${offersResult.totalItems} total offers available

**Options:**
1. **Analyze Sample**: Work with current ${offersResult.data.length} offers
2. **Get All Data**: Fetch all ${offersResult.totalItems} offers (estimated time: ${Math.round((offersResult.estimatedFullTime || 0) / 1000)}s)

**Recommendations:**
${offersResult.recommendations.map((r: string) => `- ${r}`).join('\n')}

Would you like to proceed with the complete dataset or analyze the sample?`
              }
            }]
          };
        }

        if (offersResult.status === 'sample' || offersResult.status === 'complete') {
          offersData = { offers: offersResult.data };
          if (process.env.NODE_ENV === 'development') {
            console.info('Smart offers retrieved:', offersResult.data?.length || 0);
          }
        } else {
          errors.push(`Offers fetch error: ${offersResult.message}`);
        }
      } catch (error) {
        errors.push(`Offers API error: ${error}`);
      }
    }

    // === FETCH STATS DATA ===
    if (data_type === 'stats' || data_type === 'combined') {
      try {
        // Determine date range
        let statsDateFrom = date_from;
        let statsDateTo = date_to;
        
        if (period && !date_from && !date_to) {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          
          switch (period) {
            case 'today':
              statsDateFrom = statsDateTo = today;
              break;
            case 'yesterday':
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              statsDateFrom = statsDateTo = yesterday.toISOString().split('T')[0];
              break;
            case 'last7days':
              const weekAgo = new Date(now);
              weekAgo.setDate(weekAgo.getDate() - 7);
              statsDateFrom = weekAgo.toISOString().split('T')[0];
              statsDateTo = today;
              break;
            case 'last30days':
              const monthAgo = new Date(now);
              monthAgo.setDate(monthAgo.getDate() - 30);
              statsDateFrom = monthAgo.toISOString().split('T')[0];
              statsDateTo = today;
              break;
            case 'thismonth':
              statsDateFrom = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
              statsDateTo = today;
              break;
            case 'lastmonth':
              const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
              statsDateFrom = lastMonth.toISOString().split('T')[0];
              statsDateTo = lastMonthEnd.toISOString().split('T')[0];
              break;
          }
        }

        if (!statsDateFrom || !statsDateTo) {
          // Default to last 7 days if no dates provided
          const now = new Date();
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          statsDateFrom = weekAgo.toISOString().split('T')[0];
          statsDateTo = now.toISOString().split('T')[0];
        }

        // Use preset if specified
        let statsParams;
        if (preset) {
          const presets = createCustomStatsPresets();
          const presetFunc = (presets as any)[preset];
          if (presetFunc) {
            statsParams = presetFunc(statsDateFrom, statsDateTo, offer, country);
          } else {
            // Fallback to manual parameters
            statsParams = {
              slice,
              date_from: statsDateFrom,
              date_to: statsDateTo,
              fields: stats_fields,
              conversionTypes,
              currency,
              advertiser,
              affiliate,
              offer,
              country,
              os,
              device,
              browser,
              sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8,
              nonzero,
              page,
              limit,
              orderType,
              timezone
            };
          }
        } else {
          // Manual parameters
          statsParams = {
            slice,
            date_from: statsDateFrom,
            date_to: statsDateTo,
            fields: stats_fields,
            conversionTypes,
            currency,
            advertiser,
            affiliate,
            offer,
            country,
            os,
            device,
            browser,
            sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8,
            nonzero,
            page,
            limit,
            orderType,
            timezone
          };
        }

        const statsResult = await smartGetAffiseStats(config, statsParams, {
          userIntent: analysis_type === 'comprehensive' ? 'analyze' : 'explore',
          autoComplete: format === 'executive' // Auto-complete for executive reports
        });

        if (statsResult.status === 'user_confirmation_required') {
          return {
            messages: [{
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `📊 **LARGE STATS DATASET DETECTED**

${statsResult.message}

**Sample Analysis Available:**
- ${statsResult.data.length} records in sample
- ${statsResult.totalItems} total records available

**Options:**
1. **Analyze Sample**: Work with current ${statsResult.data.length} records
2. **Get All Data**: Fetch all ${statsResult.totalItems} records (estimated time: ${Math.round((statsResult.estimatedFullTime || 0) / 1000)}s)

**Recommendations:**
${statsResult.recommendations.map(r => `- ${r}`).join('\n')}

Would you like to proceed with the complete dataset or analyze the sample?`
              }
            }]
          };
        }

        if (statsResult.status === 'sample' || statsResult.status === 'complete') {
          statsData = { stats: statsResult.data };
          if (process.env.NODE_ENV === 'development') {
            console.info('Smart stats retrieved:', statsResult.data?.length || 0, 'records');
          }
        } else {
          errors.push(`Stats fetch error: ${statsResult.message}`);
        }
      } catch (error) {
        errors.push(`Stats API error: ${error}`);
      }
    }

    // === FETCH TRAFFICBACK DATA ===
    if (data_type === 'trafficback' || data_type === 'combined') {
      try {
        // Use same date range as stats
        let tbDateFrom = date_from;
        let tbDateTo = date_to;
        
        if (period && !date_from && !date_to) {
          const now = new Date();
          const today = now.toISOString().split('T')[0];
          
          switch (period) {
            case 'today':
              tbDateFrom = tbDateTo = today;
              break;
            case 'yesterday':
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              tbDateFrom = tbDateTo = yesterday.toISOString().split('T')[0];
              break;
            case 'last7days':
              const weekAgo = new Date(now);
              weekAgo.setDate(weekAgo.getDate() - 7);
              tbDateFrom = weekAgo.toISOString().split('T')[0];
              tbDateTo = today;
              break;
            case 'last30days':
              const monthAgo = new Date(now);
              monthAgo.setDate(monthAgo.getDate() - 30);
              tbDateFrom = monthAgo.toISOString().split('T')[0];
              tbDateTo = today;
              break;
            case 'thismonth':
              tbDateFrom = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-01`;
              tbDateTo = today;
              break;
            case 'lastmonth':
              const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
              tbDateFrom = lastMonth.toISOString().split('T')[0];
              tbDateTo = lastMonthEnd.toISOString().split('T')[0];
              break;
          }
        }

        if (!tbDateFrom || !tbDateTo) {
          // Default to last 7 days
          const now = new Date();
          const weekAgo = new Date(now);
          weekAgo.setDate(weekAgo.getDate() - 7);
          tbDateFrom = weekAgo.toISOString().split('T')[0];
          tbDateTo = now.toISOString().split('T')[0];
        }

        const trafficbackParams = {
          date_from: tbDateFrom,
          date_to: tbDateTo,
          country: trafficback_countries || country,
          offer: trafficback_offers || offer,
          device: trafficback_devices || device,
          os: trafficback_os || os,
          page,
          limit,
          orderType,
          timezone
        };

        const trafficbackResult = await getTrafficbackStats(config, trafficbackParams);

        if (trafficbackResult.status === 'ok') {
          trafficbackData = trafficbackResult.data;
          if (process.env.NODE_ENV === 'development') {
            console.info('Trafficback retrieved:', trafficbackResult.metadata?.total_records || 0, 'records');
          }
        } else {
          errors.push(`Trafficback fetch error: ${trafficbackResult.message}`);
        }
      } catch (error) {
        errors.push(`Trafficback API error: ${error}`);
      }
    }

    // === HANDLE ERRORS ===
    if (errors.length > 0 && !offersData && !statsData && !trafficbackData) {
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `I attempted to retrieve Affise data but encountered errors: ${errors.join(', ')}

Please check your Affise API configuration and try again. You can:
1. Use the \`affise_status\` tool to verify connectivity
2. Manually use individual tools (\`affise_search_offers\`, \`affise_stats\`, \`affise_trafficback\`)
3. Check your API credentials in the .env file

Parameters that failed:
- Data Type: ${data_type}
- Search Query: "${search_query}"
- Date Range: ${date_from || 'auto'} to ${date_to || 'auto'}
- Period: ${period || 'custom'}

Would you like me to help troubleshoot the connection issue?`
            }
          }
        ]
      };
    }

    // === BUILD ANALYSIS PROMPT ===
    const dataTypeLabels = {
      offers: 'Offer Portfolio',
      stats: 'Performance Statistics',
      trafficback: 'Trafficback Analysis', 
      combined: 'Comprehensive Multi-Data'
    };

    const analysisTypes = {
      comprehensive: 'Conduct a comprehensive cross-dimensional analysis',
      performance: 'Focus on performance optimization and efficiency',
      revenue: 'Analyze revenue generation and profitability',
      quality: 'Assess traffic quality and conversion efficiency',
      geographic: 'Analyze geographic performance and opportunities',
      technical: 'Examine technical aspects and platform performance',
      funnel: 'Conduct conversion funnel analysis',
      partner: 'Evaluate affiliate and advertiser relationships',
      competitive: 'Conduct competitive analysis and benchmarking',
      optimization: 'Identify optimization opportunities and bottlenecks'
    };

    const formatInstructions = {
      summary: 'Provide a concise executive summary with key findings',
      detailed: 'Provide comprehensive analysis with detailed insights',
      actionable: 'Focus on practical recommendations and implementation steps',
      executive: 'Create executive-level strategic insights and recommendations'
    };

    const analysisInstruction = analysisTypes[analysis_type as keyof typeof analysisTypes] || 
                                `Conduct analysis with focus on: ${analysis_type}`;

    const focusText = focus_areas.length > 0 
      ? `\n\nPay special attention to these aspects: ${focus_areas.join(', ')}`
      : '';

    const comparisonText = comparison_period 
      ? `\n\nCompare performance against: ${comparison_period}`
      : '';

    const kpiText = kpi_targets 
      ? `\n\nEvaluate against these KPI targets:\n${Object.entries(kpi_targets).map(([key, value]) => `- ${key}: ${value}`).join('\n')}`
      : '';

    // Build data sections
    let dataOverview = '';
    let dataContent = '';
    
    if (offersData) {
      const offerCount = offersData.offers?.length || 0;
      dataOverview += `\n- **Offers**: ${offerCount} offers analyzed`;
      dataContent += `\n\n**OFFERS DATA:**\n${JSON.stringify(offersData, null, 2)}`;
    }
    
    if (statsData) {
      const statsCount = statsData.stats?.length || 0;
      dataOverview += `\n- **Statistics**: ${statsCount} performance records`;
      dataContent += `\n\n**PERFORMANCE STATISTICS:**\n${JSON.stringify(statsData, null, 2)}`;
    }
    
    if (trafficbackData) {
      const tbCount = trafficbackData.stats?.length || 0;
      dataOverview += `\n- **Trafficback**: ${tbCount} trafficback records`;
      dataContent += `\n\n**TRAFFICBACK DATA:**\n${JSON.stringify(trafficbackData, null, 2)}`;
    }

    if (errors.length > 0) {
      dataOverview += `\n- **Warnings**: ${errors.length} data retrieval warnings`;
      dataContent += `\n\n**RETRIEVAL WARNINGS:**\n${errors.map(e => `- ${e}`).join('\n')}`;
    }

    const prompt = `I've automatically retrieved and integrated ${dataTypeLabels[data_type]} data from Affise. ${analysisInstruction}.

**DATA OVERVIEW:**${dataOverview}
- **Analysis Type**: ${dataTypeLabels[data_type]}
- **Date Range**: ${date_from || 'auto-determined'} to ${date_to || 'auto-determined'}
- **Period**: ${period || 'custom range'}
- **Timestamp**: ${new Date().toISOString()}

**ENHANCED MULTI-DIMENSIONAL ANALYSIS FRAMEWORK:**

${data_type === 'offers' || data_type === 'combined' ? `
1. **OFFER PORTFOLIO ANALYSIS**:
   - **Portfolio Overview**: Total offers, status distribution, verticals
   - **Geographic Coverage**: Available countries and restrictions
   - **Payout Structure**: Payment models, commission rates, caps
   - **Performance Potential**: Best conversion opportunities
   - **Market Positioning**: Competitive advantages and unique selling points
   - **Risk Assessment**: Compliance requirements and restrictions
` : ''}

${data_type === 'stats' || data_type === 'combined' ? `
2. **PERFORMANCE STATISTICS ANALYSIS**:
   - **Traffic Volume**: Views, clicks, hosts, traffic quality
   - **Conversion Metrics**: CR, conversions by type, funnel efficiency
   - **Financial Performance**: Revenue, earnings, payouts, EPC, ECPM
   - **Segmentation Analysis**: ${slice.join(', ')} performance breakdown
   - **Quality Indicators**: Approval rates, decline patterns, traffic sources
   - **Temporal Patterns**: Time-based performance trends and optimization
` : ''}

${data_type === 'trafficback' || data_type === 'combined' ? `
3. **TRAFFICBACK ANALYSIS**:
   - **Volume Assessment**: Total trafficback and percentage impact
   - **Reason Analysis**: Primary causes and categorization
   - **Geographic Impact**: Country-specific trafficback patterns
   - **Technical Factors**: Device, OS, and browser-related issues
   - **Quality Implications**: Effect on overall conversion rates
   - **Optimization Opportunities**: Reducing trafficback and improving retention
` : ''}

${data_type === 'combined' ? `
4. **INTEGRATED CROSS-DATA INSIGHTS**:
   - **Offer-Performance Correlation**: Which offers drive best stats
   - **Quality-Trafficback Relationship**: Impact on overall performance
   - **Portfolio Optimization**: Best offer-traffic source combinations
   - **Risk vs. Reward Analysis**: High-potential vs. stable opportunities
   - **Resource Allocation**: Where to focus traffic and investment
   - **Scaling Strategies**: Sustainable growth opportunities
` : ''}

**STRATEGIC RECOMMENDATIONS FRAMEWORK**:

1. **IMMEDIATE ACTIONS** (Next 24-48 hours):
   - Quick wins and urgent optimizations
   - Critical issues requiring immediate attention
   - Low-effort, high-impact improvements

2. **SHORT-TERM STRATEGY** (Next 1-4 weeks):
   - Campaign optimizations and adjustments
   - Traffic source reallocations
   - Partner relationship enhancements

3. **MEDIUM-TERM PLANNING** (1-3 months):
   - Portfolio expansion opportunities
   - New market entry strategies
   - Technology and process improvements

4. **LONG-TERM VISION** (3+ months):
   - Strategic partnerships and scaling
   - Market positioning and competitive advantages
   - Sustainable growth frameworks

**PERFORMANCE METRICS FOCUS**:
${stats_fields.length > 0 ? `- **Primary Metrics**: ${stats_fields.join(', ')}` : ''}
${conversionTypes.length > 0 ? `\n- **Conversion Types**: ${conversionTypes.join(', ')}` : ''}
${slice.length > 0 ? `\n- **Analysis Dimensions**: ${slice.join(', ')}` : ''}
- **Timezone**: ${timezone}
- **Data Quality**: ${nonzero ? 'Non-zero conversions only' : 'All data included'}${focusText}${comparisonText}${kpiText}

**CRITICAL SUCCESS FACTORS**:
- **Data-Driven Decision Making**: Base all recommendations on retrieved data
- **ROI-Focused Optimization**: Prioritize actions with highest revenue impact
- **Risk-Aware Growth**: Balance opportunity with sustainable practices
- **Scalable Solutions**: Recommendations that can grow with business
- **Quality Maintenance**: Ensure optimizations don't compromise traffic quality
- **Partner Relationships**: Consider impact on affiliate and advertiser partnerships

**RESPONSE FORMAT**: ${formatInstructions[format]}

**DATA FOR ANALYSIS:**${dataContent}

**ANALYSIS REQUIREMENTS**:
- Integrate insights across all available data sources
- Quantify all opportunities with potential impact estimates
- Provide specific, actionable recommendations with implementation timelines
- Consider market context and competitive landscape
- Include risk assessment and mitigation strategies
- Focus on sustainable, scalable growth opportunities
- Maintain data quality and compliance standards

Conduct a systematic analysis following this enhanced framework and provide comprehensive, data-driven insights with specific, prioritized recommendations for optimizing ${data_type === 'combined' ? 'integrated campaign performance' : dataTypeLabels[data_type].toLowerCase()}.`;

    if (process.env.NODE_ENV === 'development') {
      console.info('Generated comprehensive analysis prompt for', dataTypeLabels[data_type]);
    }

    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: prompt
          }
        }
      ]
    };

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in auto analysis:', error);
    }
    
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I encountered an error while trying to automatically retrieve and analyze data: ${error}

Please try one of these alternatives:
1. Use the \`affise_status\` tool to check API connectivity
2. Manually use individual tools:
   - \`affise_search_offers\` for offer analysis
   - \`affise_stats\` for performance statistics
   - \`affise_trafficback\` for trafficback analysis
3. Check your configuration and try with simpler parameters

Attempted configuration:
- Data Type: ${data_type}
- Search Query: "${search_query}"
- Date Range: ${date_from || 'auto'} to ${date_to || 'auto'}
- Period: ${period || 'custom'}
- Analysis Type: ${analysis_type}

Would you like me to help with troubleshooting or suggest alternative approaches?`
          }
        }
      ]
    };
  }
}

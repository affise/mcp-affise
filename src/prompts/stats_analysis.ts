import { SliceType, FieldType, ConversionType } from '../tools/affise_custom_stats.js';

export interface StatsAnalysisParams {
  // Affise Custom Stats API parameters
  slice?: SliceType[];         // Data slicing options (day, offer, country, etc.)
  date_from?: string;          // Start date (YYYY-MM-DD format)
  date_to?: string;            // End date (YYYY-MM-DD format)
  period?: 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thismonth' | 'lastmonth'; // Quick date range
  
  // Filter parameters
  currency?: string[];         // Currency codes
  advertiser?: string[];       // Advertiser IDs
  advertiser_manager_id?: string[]; // Advertiser manager IDs
  affiliate?: string[];        // Affiliate/Partner IDs
  affiliate_manager_id?: string[]; // Affiliate manager IDs
  offer?: number[];            // Offer IDs
  country?: string[];          // Country codes
  city?: string[];             // City names
  os?: string[];               // Operating systems
  os_version?: string[];        // Operating system versions
  browser?: string[];          // Browser types
  browser_version?: string[];  // Browser versions
  device?: string[];           // Device types
  device_model?: string[];     // Device models
  conn_type?: string[];        // Connection types
  isp?: string[];              // ISP names
  landing?: string[];          // Landing page IDs
  prelanding?: string[];       // Pre-landing page IDs
  smart_id?: string[];         // SmartLink category IDs
  sub1?: string[];             // Sub ID 1 values
  sub2?: string[];             // Sub ID 2 values
  sub3?: string[];             // Sub ID 3 values
  sub4?: string[];             // Sub ID 4 values
  sub5?: string[];             // Sub ID 5 values
  sub6?: string[];             // Sub ID 6 values
  sub7?: string[];             // Sub ID 7 values
  sub8?: string[];             // Sub ID 8 values
  goal?: string[];             // Goal names
  trafficback_reason?: string[]; // Traffic back reasons
  fields?: FieldType[];        // Metrics to include
  conversionTypes?: ConversionType[]; // Conversion types
  nonzero?: 0 | 1;            // Non-zero conversions only
  
  // Display and pagination
  page?: number;               // Page number
  limit?: number;              // Maximum number of records
  orderType?: 'asc' | 'desc';  // Sort direction
  order?: string[];            // Fields to sort by
  timezone?: string;           // Timezone
  locale?: 'en' | 'ru' | 'es'; // Response language
  preset?: string;             // Quick preset configuration
  
  // Analysis parameters
  analysis_type?: string;       // Type of analysis to perform
  focus_metrics?: string[];     // Specific metrics to focus on
  comparison_period?: string;   // Period to compare against
  format?: 'summary' | 'detailed' | 'actionable' | 'executive'; // Output format
  kpi_targets?: {              // Optional KPI targets for comparison
    conversion_rate?: number;
    epc?: number;
    revenue_target?: number;
    ecpm_target?: number;
    approval_rate?: number;
  };
}

export function createStatsAnalysisPrompt(params: StatsAnalysisParams) {
  const {
    slice = ['day'],
    date_from,
    date_to,
    period,
    fields = ['views', 'clicks', 'conversions', 'earnings', 'income','noincome', 'payouts', 'trafficback', 'hosts', 'cr', 'epc', 'ecpm'],
    currency,
    advertiser,
    advertiser_manager_id,
    affiliate,
    affiliate_manager_id,
    offer,
    country,
    city,
    os,
    os_version,
    browser,
    browser_version,
    device,
    device_model,
    conn_type,
    isp,
    landing,
    prelanding,
    smart_id,
    sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8,
    goal,
    trafficback_reason,
    conversionTypes = ['total', 'confirmed', 'pending', 'declined'],
    nonzero,
    page = 1,
    limit = 100,
    orderType = 'desc',
    order,
    timezone = 'UTC',
    locale = 'en',
    preset,
    analysis_type = 'comprehensive',
    focus_metrics = [],
    comparison_period,
    format = 'detailed',
    kpi_targets
  } = params;

  // Build date range text
  const dateRangeText = period 
    ? `\n\nAnalyzing ${period} data`
    : date_from && date_to
    ? `\n\nAnalyzing data from ${date_from} to ${date_to}`
    : '';

  // Build comprehensive filter parameters text
  const filterText = [];
  if (currency?.length) filterText.push(`Currency: ${currency.join(', ')}`);
  if (country?.length) filterText.push(`Countries: ${country.join(', ')}`);
  if (city?.length) filterText.push(`Cities: ${city.length} selected`);
  if (advertiser?.length) filterText.push(`Advertisers: ${advertiser.length} selected`);
  if (advertiser_manager_id?.length) filterText.push(`Advertiser Managers: ${advertiser_manager_id.length} selected`);
  if (affiliate?.length) filterText.push(`Affiliates: ${affiliate.length} selected`);
  if (affiliate_manager_id?.length) filterText.push(`Affiliate Managers: ${affiliate_manager_id.length} selected`);
  if (offer?.length) filterText.push(`Offers: ${offer.length} selected`);
  if (os?.length) filterText.push(`OS: ${os.join(', ')}`);
  if (os_version?.length) filterText.push(`OS Versions: ${os_version.length} selected`);
  if (browser?.length) filterText.push(`Browsers: ${browser.join(', ')}`);
  if (browser_version?.length) filterText.push(`Browser Versions: ${browser_version.length} selected`);
  if (device?.length) filterText.push(`Devices: ${device.join(', ')}`);
  if (device_model?.length) filterText.push(`Device Models: ${device_model.length} selected`);
  if (conn_type?.length) filterText.push(`Connection Types: ${conn_type.join(', ')}`);
  if (isp?.length) filterText.push(`ISPs: ${isp.length} selected`);
  if (landing?.length) filterText.push(`Landing Pages: ${landing.length} selected`);
  if (prelanding?.length) filterText.push(`Pre-landing Pages: ${prelanding.length} selected`);
  if (smart_id?.length) filterText.push(`SmartLink Categories: ${smart_id.length} selected`);
  if (sub1?.length) filterText.push(`Sub1: ${sub1.length} selected`);
  if (sub2?.length) filterText.push(`Sub2: ${sub2.length} selected`);
  if (sub3?.length) filterText.push(`Sub3: ${sub3.length} selected`);
  if (sub4?.length) filterText.push(`Sub4: ${sub4.length} selected`);
  if (sub5?.length) filterText.push(`Sub5: ${sub5.length} selected`);
  if (sub6?.length) filterText.push(`Sub6: ${sub6.length} selected`);
  if (sub7?.length) filterText.push(`Sub7: ${sub7.length} selected`);
  if (sub8?.length) filterText.push(`Sub8: ${sub8.length} selected`);
  if (goal?.length) filterText.push(`Goals: ${goal.join(', ')}`);
  if (nonzero) filterText.push('Non-zero conversions only');
  if (timezone && timezone !== 'UTC') filterText.push(`Timezone: ${timezone}`);
  
  const filtersApplied = filterText.length > 0 
    ? `\n\nFilters applied: ${filterText.join(', ')}`
    : '';

  // Build focus metrics text
  const focusText = focus_metrics.length > 0 
    ? `\n\nPay special attention to these metrics: ${focus_metrics.join(', ')}`
    : '';

  // Build comparison text
  const comparisonText = comparison_period 
    ? `\n\nCompare performance against: ${comparison_period}`
    : '';

  // Build KPI targets text
  const kpiText = kpi_targets 
    ? `\n\nEvaluate performance against these targets:\n${Object.entries(kpi_targets).map(([key, value]) => `- ${key}: ${value}`).join('\n')}`
    : '';

  // Build format instructions
  const formatInstructions = {
    summary: 'Provide a concise overview with key findings and critical insights.',
    detailed: 'Provide comprehensive analysis with detailed breakdown of all important metrics.',
    actionable: 'Focus on practical recommendations and specific optimization actions.',
    executive: 'Create an executive summary suitable for stakeholders with key insights and strategic recommendations.'
  };

  const analysisTypes = {
    comprehensive: 'Conduct a complete analysis of all traffic and conversion metrics across all dimensions',
    performance: 'Focus on conversion performance and revenue optimization',
    traffic: 'Analyze traffic quality and source effectiveness',
    funnel: 'Examine the conversion funnel from impressions to payouts',
    financial: 'Focus on revenue, costs, and profitability metrics',
    quality: 'Assess traffic quality and conversion efficiency',
    optimization: 'Identify optimization opportunities and bottlenecks',
    technical: 'Analyze technical aspects like devices, browsers, and connection types',
    geographic: 'Focus on geographic performance and regional opportunities',
    temporal: 'Analyze time-based patterns and trends',
    partner: 'Evaluate affiliate and advertiser performance',
    landing: 'Analyze landing page and pre-landing page effectiveness'
  };

  const analysisInstruction = analysisTypes[analysis_type as keyof typeof analysisTypes] || 
                              `Conduct analysis with focus on: ${analysis_type}`;

  // Build slice-specific analysis instructions
  const sliceInstructions = [];
  if (slice.includes('hour')) sliceInstructions.push('- **Hourly Patterns**: Identify peak performance hours and optimize ad scheduling');
  if (slice.includes('day')) sliceInstructions.push('- **Daily Trends**: Track day-over-day performance and identify patterns');
  if (slice.includes('month') || slice.includes('year')) sliceInstructions.push('- **Long-term Trends**: Analyze seasonal patterns and growth trends');
  if (slice.includes('country') || slice.includes('city')) sliceInstructions.push('- **Geographic Analysis**: Evaluate regional performance and expansion opportunities');
  if (slice.includes('device') || slice.includes('os') || slice.includes('browser')) sliceInstructions.push('- **Technical Analysis**: Assess device and platform performance for optimization');
  if (slice.includes('offer')) sliceInstructions.push('- **Offer Performance**: Compare offer effectiveness and identify top performers');
  if (slice.includes('affiliate') || slice.includes('advertiser')) sliceInstructions.push('- **Partner Analysis**: Evaluate partner performance and relationship optimization');
  if (slice.some(s => s.startsWith('sub'))) sliceInstructions.push('- **Campaign Tracking**: Analyze sub-ID performance for traffic source optimization');
  if (slice.includes('landing') || slice.includes('prelanding')) sliceInstructions.push('- **Landing Page Analysis**: Optimize page performance and user experience');
  if (slice.includes('isp') || slice.includes('conn_type')) sliceInstructions.push('- **Network Analysis**: Evaluate ISP and connection type impact on performance');

  const sliceSpecificText = sliceInstructions.length > 0 
    ? `\n\n**SLICE-SPECIFIC ANALYSIS FOCUS:**\n${sliceInstructions.join('\n')}`
    : '';

  const prompt = `You are an expert affiliate marketing analyst. ${analysisInstruction} using the Affise custom statistics API.

First, retrieve the statistics data using the affise_stats tool with these parameters:
- Slice: ${slice.join(', ')}
- Fields: ${fields.join(', ')}
- Conversion Types: ${conversionTypes.join(', ')}
- Limit: ${limit}
- Order: ${orderType}${order ? ` by ${order.join(', ')}` : ''}
- Timezone: ${timezone}${period ? `\n- Period: ${period}` : ''}${date_from && date_to ? `\n- Date range: ${date_from} to ${date_to}` : ''}${preset ? `\n- Using preset: ${preset}` : ''}${dateRangeText}${filtersApplied}

**ENHANCED ANALYSIS FRAMEWORK:**

1. **TRAFFIC VOLUME & QUALITY ANALYSIS**:
   - **Views/Impressions**: Total ad exposure and reach
   - **Hosts**: Unique traffic sources and diversity assessment
   - **Clicks**: Traffic engagement and interest levels
   - **Click-Through Rate (CTR)**: Views-to-clicks conversion efficiency
   - **Traffic Quality Score**: Overall traffic assessment based on conversion patterns
   - **Trafficback Analysis**: Bounce rate and traffic retention

2. **ENHANCED CONVERSION FUNNEL ANALYSIS**:
   - **Multi-Stage Funnel**: Views → Clicks → Conversions → Approved
   - **Conversion Rate (CR)**: Clicks-to-conversions efficiency
   - **Approval Rate**: Approved conversions / Total conversions
   - **Quality Assessment**: Declined vs. approved conversion analysis
   - **Processing Efficiency**: Pending vs. processed conversion rates
   - **Fraud Indicators**: Unusual decline patterns or suspicious activity

3. **COMPREHENSIVE FINANCIAL METRICS**:
   - **Income/Revenue**: Total gross revenue generated
   - **Earnings**: Net profit (Income - Payouts)
   - **Payouts/Commissions**: Affiliate commission expenses
   - **EPC (Earnings Per Click)**: Revenue efficiency per click
   - **ECPM (Effective Cost Per Mille)**: Revenue per 1000 impressions
   - **Affiliate Price (AFPrice)**: Payout rates and commission structure
   - **Profit Margins**: Earnings-to-income ratio analysis
   - **ROI Calculations**: Return on investment metrics

4. **ADVANCED SEGMENTATION ANALYSIS**:
   ${slice.includes('country') || slice.includes('city') ? '- **Geographic Performance**: Country and city-level analysis with expansion opportunities' : ''}
   ${slice.includes('device') || slice.includes('os') || slice.includes('browser') ? '- **Technical Segmentation**: Device, OS, and browser performance optimization' : ''}
   ${slice.includes('hour') || slice.includes('day') ? '- **Temporal Patterns**: Time-based performance optimization and scheduling' : ''}
   ${slice.includes('offer') ? '- **Offer Comparison**: Cross-offer performance and portfolio optimization' : ''}
   ${slice.includes('affiliate') || slice.includes('advertiser') ? '- **Partner Performance**: Affiliate and advertiser relationship analysis' : ''}
   ${slice.some(s => s.startsWith('sub')) ? '- **Campaign Tracking**: Sub-ID performance for traffic source optimization' : ''}
   ${slice.includes('landing') || slice.includes('prelanding') ? '- **Landing Page Optimization**: Page performance and conversion optimization' : ''}

5. **QUALITY & PERFORMANCE INDICATORS**:
   - **Conversion Quality Score**: Composite metric of approval rate and CR
   - **Traffic Source Reliability**: Consistency and fraud assessment
   - **Revenue Consistency**: Performance stability across time periods
   - **Competitive Performance**: Benchmark against industry standards
   - **Efficiency Ratios**: Cost-effectiveness and resource utilization

6. **OPTIMIZATION OPPORTUNITIES IDENTIFICATION**:
   - **Underperforming Segments**: Areas requiring immediate attention
   - **High-Potential Opportunities**: Scaling and expansion possibilities
   - **Cost Optimization**: Payout and commission optimization
   - **Traffic Quality Improvement**: Source optimization and fraud reduction
   - **Conversion Rate Enhancement**: Funnel optimization strategies
   - **Revenue Maximization**: Pricing and offer optimization

7. **RISK ASSESSMENT & COMPLIANCE**:
   - **Fraud Detection**: Unusual patterns and suspicious activity
   - **Quality Decline Indicators**: Performance degradation signals
   - **Concentration Risks**: Over-reliance on single sources or partners
   - **Compliance Issues**: Regulatory and policy adherence
   - **Financial Risks**: Cash flow and margin compression indicators

**ENHANCED METRICS INTERPRETATION GUIDE**:
- **VIEWS/IMPRESSIONS**: Ad exposure and reach measurement
- **HOSTS**: Unique traffic sources and diversity indicator
- **CLICKS**: User engagement and initial interest
- **CONVERSIONS**: Desired actions completed by users
- **CONFIRMED/APPROVED**: Valid, verified conversions
- **PENDING**: Conversions awaiting review or processing
- **HOLD**: Conversions under investigation
- **DECLINED**: Rejected or invalid conversions
- **INCOME/REVENUE**: Total gross revenue generated
- **PAYOUTS**: Affiliate commissions and costs
- **EARNINGS**: Net profit (Income - Payouts)
- **AFPRICE**: Affiliate payout rates
- **TRAFFICBACK**: Redirected or bounced traffic
- **CR**: Conversion Rate (Conversions/Clicks × 100)
- **EPC**: Earnings Per Click (Earnings/Clicks)
- **ECPM**: Effective Cost Per Mille (Income/Views × 1000)
- **RATIO**: Various performance ratios and efficiency metrics${focusText}${comparisonText}${kpiText}${sliceSpecificText}

**RESPONSE FORMAT**: ${formatInstructions[format]}

**ANALYSIS REQUIREMENTS**:
- Calculate and interpret all key ratios and percentages
- Identify trends, patterns, and anomalies within slice dimensions
- Provide comparative analysis across segments
- Highlight performance outliers and investigate causes
- Quantify optimization opportunities with potential impact estimates
- Consider seasonal factors, market conditions, and external influences
- Leverage multi-dimensional slicing for deep insights
- Provide specific, actionable recommendations with implementation priorities
- Include risk assessment and mitigation strategies
- Consider scalability and resource allocation implications

**CRITICAL SUCCESS FACTORS**:
- Data accuracy and quality validation
- Contextual interpretation within market conditions
- Actionable insights with clear implementation paths
- ROI-focused recommendations with measurable outcomes
- Risk-aware optimization strategies
- Scalable solutions for sustainable growth

After retrieving the data, conduct a systematic analysis following this enhanced framework, provide data-driven insights, and deliver specific, prioritized recommendations for optimizing campaign performance, profitability, and sustainable growth.

**IMPORTANT**: Always start by calling the affise_stats tool to fetch the current data before performing analysis.`;

  return {
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: prompt
        }
      }
    ],
    // Include the enhanced Affise Custom Stats API parameters for easy access
    affise_params: {
      slice,
      date_from,
      date_to,
      period,
      fields,
      currency,
      advertiser,
      advertiser_manager_id,
      affiliate,
      affiliate_manager_id,
      offer,
      country,
      city,
      os,
      browser,
      browser_version,
      device,
      device_model,
      conn_type,
      isp,
      landing,
      prelanding,
      smart_id,
      sub1, sub2, sub3, sub4, sub5, sub6, sub7, sub8,
      goal,
      conversionTypes,
      nonzero,
      page,
      limit,
      orderType,
      order,
      timezone,
      locale,
      preset
    }
  };
}

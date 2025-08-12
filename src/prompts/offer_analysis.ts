export interface OfferAnalysisParams {
  offers_data: string;           // JSON string of offers data
  analysis_type?: string;        // Type of analysis to perform
  focus_areas?: string[];        // Specific areas to focus on
  comparison_criteria?: string;  // What to compare/analyze
  format?: 'summary' | 'detailed' | 'actionable'; // Output format
}

export function createOfferAnalysisPrompt(params: OfferAnalysisParams) {
  const {
    offers_data,
    analysis_type = 'comprehensive',
    focus_areas = [],
    comparison_criteria,
    format = 'detailed'
  } = params;

  // Build focus areas text
  const focusText = focus_areas.length > 0 
    ? `\n\nPay special attention to the following aspects: ${focus_areas.join(', ')}`
    : '';

  // Build comparison text
  const comparisonText = comparison_criteria 
    ? `\n\nCompare and analyze offers based on: ${comparison_criteria}`
    : '';

  // Build format instructions
  const formatInstructions = {
    summary: 'Provide a brief overview with key findings and main metrics.',
    detailed: 'Provide detailed analysis with comprehensive breakdown of each important aspect.',
    actionable: 'Focus on practical recommendations and specific actions for optimization.'
  };

  const analysisTypes = {
    comprehensive: 'Conduct a comprehensive analysis of the offers',
    performance: 'Analyze performance and efficiency of the offers',
    market: 'Conduct market analysis of the offers',
    technical: 'Perform technical analysis of settings and configuration',
    competitive: 'Conduct competitive analysis of the offers',
    compliance: 'Analyze compliance with requirements and policies'
  };

  const analysisInstruction = analysisTypes[analysis_type as keyof typeof analysisTypes] || 
                              `Conduct analysis of offers with focus on: ${analysis_type}`;

  const prompt = `You are an expert in affiliate marketing data analysis. ${analysisInstruction} based on the provided data.

OFFERS DATA:
${offers_data}

ANALYSIS INSTRUCTIONS:

1. **General Overview**:
   - Number of offers
   - Status distribution
   - Main categories and verticals

2. **Detailed Offer Analysis**:
   - Payout and payment model analysis
   - Geographic coverage
   - Targeting and restrictions
   - Creative and landing page quality

3. **Performance and Metrics**:
   - Payout rates comparison
   - Conversion and EPC analysis
   - Caps and limits
   - Trends and seasonality

4. **Recommendations**:
   - Best offers for promotion
   - Potential issues and risks
   - Optimization opportunities
   - Strategic recommendations

5. **Technical Aspects**:
   - Tracking methods
   - Integrations and postbacks
   - Traffic requirements
   - Compliance and restrictions${focusText}${comparisonText}

RESPONSE FORMAT: ${formatInstructions[format]}

Structure the analysis logically, use data to support conclusions, and provide practical recommendations for maximizing profit from these offers.`;

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
}

import { TrafficbackStatsParams } from "../tools/affise_trafficback.js";

export interface TrafficbackAnalysisParams {
  trafficback_data: string;  // JSON string of trafficback data
  analysis_type?: 'comprehensive' | 'geo' | 'reason' | 'partner' | 'advertiser' | 'technical' | 'goal';
  focus_areas?: string[];
  comparison_criteria?: string;
  format?: 'summary' | 'detailed' | 'actionable';
}

export function createTrafficbackAnalysisPrompt(params: TrafficbackAnalysisParams) {
  const {
    trafficback_data,
    analysis_type = 'comprehensive',
    focus_areas = [],
    comparison_criteria,
    format = 'detailed'
  } = params;

  const focusText = focus_areas.length > 0
    ? `\n\nFocus especially on: ${focus_areas.join(', ')}`
    : '';

  const comparisonText = comparison_criteria
    ? `\n\nPerform a comparison between: ${comparison_criteria}. Highlight key differences, correlations, and anomalies. If possible, suggest causes and implications of these differences.`
    : '';

  const formatInstructions = {
    summary: 'Provide a concise summary of the trafficback patterns, key issues, and top reasons.',
    detailed: 'Provide a detailed analysis of trafficback trends with clear data-backed insights.',
    actionable: 'Focus on specific recommendations to reduce trafficback and improve performance.'
  };

  const analysisTypes = {
    comprehensive: 'Conduct a comprehensive trafficback analysis',
    geo: 'Analyze trafficback trends across different GEOs (countries)',
    reason: 'Analyze top trafficback reasons and their frequency',
    partner: 'Identify which partners generate the most trafficback',
    advertiser: 'Identify advertisers with high trafficback ratios',
    technical: 'Investigate technical causes of trafficback (e.g., unsupported device, geo mismatch)',
    goal: 'Analyze trafficback in relation to goals and sub-IDs'
  };

  const analysisInstruction = analysisTypes[analysis_type as keyof typeof analysisTypes] ||
                              `Perform trafficback analysis focused on: ${analysis_type}`;

  const prompt = `You are an expert in affiliate traffic analytics. ${analysisInstruction} using the data provided below.

TRAFFICBACK DATA:
${trafficback_data}

ANALYSIS TASKS:

1. **Overview**:
   - Total trafficback amount
   - Date range of data
   - Number of records
   - General pattern and spikes (if any)

2. **Top Trafficback Reasons**:
   - Most common reasons
   - Percentage breakdown
   - Correlation with device, country, partner, etc.

3. **Geographic Impact**:
   - Affected GEOs
   - Countries with highest trafficback
   - Cross-reference with reason or offer

4. **Partner / Advertiser Insights**:
   - Partners with highest trafficback volume or rate
   - Advertisers with patterns indicating misalignment or filtering

5. **Device & OS Breakdown**:
   - Devices or OS types with higher trafficback
   - Consider traffic targeting vs actual delivery

6. **Recommendations**:
   - Traffic quality improvements
   - Targeting adjustments
   - Potential partner filtering
   - Creative or flow changes${focusText}${comparisonText}

RESPONSE FORMAT: ${formatInstructions[format]}

Structure your response logically, use clear headers and lists, and back conclusions with data patterns. Emphasize actionable insights where possible.`;

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

export interface WorkflowAnalysisParams {
  search_query?: string;
  countries?: string[];
  status?: string[];
  analysis_type?: string;
  focus_areas?: string[];
}

export function createWorkflowAnalysisPrompt(params: WorkflowAnalysisParams) {
  const {
    search_query = '',
    countries = [],
    status = ['active'],
    analysis_type = 'comprehensive',
    focus_areas = []
  } = params;

  const searchParams = {
    q: search_query,
    countries: countries,
    status: status,
    limit: 20
  };

  const focusText = focus_areas.length > 0 
    ? ` Pay special attention to: ${focus_areas.join(', ')}.`
    : '';

  const prompt = `I need you to analyze Affise offers using the available tools. Please follow this workflow:

**STEP 1: Search for Offers**
Use the \`affise_search_offers\` tool with these parameters:
\`\`\`json
${JSON.stringify(searchParams, null, 2)}
\`\`\`

**STEP 2: Analyze the Results**
Once you have the offers data, use the \`analyze_offers\` prompt with:
- analysis_type: "${analysis_type}"
- format: "detailed"${focus_areas.length > 0 ? `\n- focus_areas: ${JSON.stringify(focus_areas)}` : ''}

**STEP 3: Provide Recommendations**
Based on the analysis, give me:
1. Top 3 offers to promote
2. Key optimization opportunities  
3. Potential risks or concerns
4. Next steps for implementation

**Search Criteria:**
- Query: "${search_query}"
- Countries: ${countries.length > 0 ? countries.join(', ') : 'All'}
- Status: ${status.join(', ')}
- Analysis Type: ${analysis_type}${focusText}

Please start by searching for the offers, then analyze them comprehensively.`;

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

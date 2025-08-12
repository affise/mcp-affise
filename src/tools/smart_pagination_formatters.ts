/**
 * 🎨 Smart Pagination Result Formatters
 */

import { SmartPaginationResult } from './smart_pagination.js';

export function formatSmartOffersResult(result: SmartPaginationResult<any>): string {
  switch (result.status) {
    case 'sample':
      return `📊 **OFFERS SAMPLE**\n\nFound ${result.data.length} offers${result.canContinue ? ` (${result.totalItems} total)` : ''}\n\n**Quick Analysis:**\n- Active: ${result.data.filter((o: any) => o.status === 'active').length}\n- Top offers: ${result.data.filter((o: any) => o.is_top === 1).length}\n- Categories: ${[...new Set(result.data.flatMap((o: any) => o.full_categories?.map((c: any) => c.title) || []))].length}\n\n**Recommendations:**\n${result.recommendations.map(r => `- ${r}`).join('\\n')}`;
    
    case 'complete':
      return `✅ **COMPLETE ANALYSIS**\n\nRetrieved all ${result.data.length} offers in ${(result.executionTime / 1000).toFixed(1)}s\n\n**Portfolio Overview:**\n- Total: ${result.data.length}\n- Active: ${result.data.filter((o: any) => o.status === 'active').length}\n- Top offers: ${result.data.filter((o: any) => o.is_top === 1).length}\n- With creatives: ${result.data.filter((o: any) => o.creatives?.length > 0).length}`;
    
    case 'user_confirmation_required':
      return `⚠️ **LARGE DATASET**\n\n${result.message}\n\n**Sample (${result.data.length} items):**\n- Total available: ${result.totalItems}\n- Est. time: ${result.estimatedFullTime ? Math.round(result.estimatedFullTime / 1000) + 's' : 'calculating...'}\n\n**Token:** \`${result.continuationToken}\``;
    
    case 'error':
      return `❌ **ERROR**\n\n${result.message}\n\n**Troubleshooting:**\n${result.errors.map(e => `- ${e}`).join('\\n')}`;
    
    default:
      return `Unknown status: ${result.status}`;
  }
}

export function formatSmartStatsResult(result: SmartPaginationResult<any>): string {
  const calculateMetrics = (stats: any[]) => {
    const clicks = stats.reduce((sum, s) => sum + (s.clicks || 0), 0);
    const conversions = stats.reduce((sum, s) => sum + (s.conversions || 0), 0);
    const earnings = stats.reduce((sum, s) => sum + (s.earnings || 0), 0);
    const cr = clicks > 0 ? (conversions / clicks * 100) : 0;
    const epc = clicks > 0 ? (earnings / clicks) : 0;
    return { clicks, conversions, earnings, cr, epc };
  };

  switch (result.status) {
    case 'sample':
      const sampleMetrics = calculateMetrics(result.data);
      return `📊 **STATS SAMPLE**\n\nAnalyzed ${result.data.length} records${result.canContinue ? ` (${result.totalItems} total)` : ''}\n\n**Performance:**\n- Clicks: ${sampleMetrics.clicks.toLocaleString()}\n- Conversions: ${sampleMetrics.conversions.toLocaleString()}\n- Earnings: $${sampleMetrics.earnings.toLocaleString()}\n- CR: ${sampleMetrics.cr.toFixed(2)}%\n- EPC: $${sampleMetrics.epc.toFixed(2)}\n\n**Recommendations:**\n${result.recommendations.map(r => `- ${r}`).join('\\n')}`;
    
    case 'complete':
      const completeMetrics = calculateMetrics(result.data);
      return `✅ **COMPLETE STATS**\n\nAnalyzed all ${result.data.length} records in ${(result.executionTime / 1000).toFixed(1)}s\n\n**Overall Performance:**\n- Clicks: ${completeMetrics.clicks.toLocaleString()}\n- Conversions: ${completeMetrics.conversions.toLocaleString()}\n- Earnings: $${completeMetrics.earnings.toLocaleString()}\n- CR: ${completeMetrics.cr.toFixed(2)}%\n- EPC: $${completeMetrics.epc.toFixed(2)}`;
    
    case 'user_confirmation_required':
      return `⚠️ **LARGE DATASET**\n\n${result.message}\n\n**Sample (${result.data.length} records):**\n- Total available: ${result.totalItems}\n- Est. time: ${result.estimatedFullTime ? Math.round(result.estimatedFullTime / 1000) + 's' : 'calculating...'}\n\n**Token:** \`${result.continuationToken}\``;
    
    case 'error':
      return `❌ **STATS ERROR**\n\n${result.message}\n\n**Troubleshooting:**\n${result.errors.map(e => `- ${e}`).join('\\n')}`;
    
    default:
      return `Unknown status: ${result.status}`;
  }
}

export const SmartPaginationFormatters = {
  offers: formatSmartOffersResult,
  stats: formatSmartStatsResult
};

export default SmartPaginationFormatters;
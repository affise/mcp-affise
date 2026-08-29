/**
 * MCP prompt registration.
 *
 * Tier 5.3 migration: every prompt is now registered via
 * `mcpServer.registerPrompt(name, {title, description, argsSchema}, cb)`
 * instead of the legacy
 * `setRequestHandler(ListPrompts/GetPromptRequestSchema, ...)` switch.
 *
 * argsSchema typing convention:
 *   - Required scalar args   → z.string()
 *   - Optional scalar args   → z.string().optional()
 *   - Array / object args    → z.unknown().optional()
 *
 * Affise clients have historically sent both `arg: 'x'` and `arg: ['x']`
 * for the same "list" argument; the spec wants strings only, but the SDK
 * doesn't enforce that and our existing client base relies on the array
 * shape. `z.unknown()` keeps both shapes valid; each callback runs the
 * pre-existing array-coercion / JSON-parse logic so the underlying
 * `create*Prompt(...)` factories see the rich types they expect.
 */

import { z } from 'zod';
import { McpServer } from '../mcp-sdk.js';
import { createOfferAnalysisPrompt } from '../prompts/offer_analysis.js';
import { createWorkflowAnalysisPrompt } from '../prompts/workflow_analysis.js';
import { createAutoAnalysisPrompt } from '../prompts/auto_analysis.js';
import { createStatsAnalysisPrompt } from '../prompts/stats_analysis.js';
import { createTrafficbackAnalysisPrompt } from '../prompts/trafficback_analysis.js';
import { createConversionsAnalysisPrompt } from '../prompts/conversions_analysis.js';
import { SliceType, FieldType, ConversionType } from '../tools/affise_custom_stats.js';

// --- Local coercion helpers -------------------------------------------------

const ensureArray = (value: unknown): string[] =>
  Array.isArray(value) ? value : (value !== undefined && value !== null ? [String(value)] : []);

const ensureOptArray = <T = string>(value: unknown): T[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return Array.isArray(value) ? (value as T[]) : ([value] as T[]);
};

const ensureNumberArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.map(Number) : (value !== undefined && value !== null ? [Number(value)] : []);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Every prompt this module registers. Exported so callers can report the
 *  count without restating it — the tool half of the startup banner was
 *  derived in an earlier commit and the prompt half was left a literal. */
export const PROMPT_NAMES = [
  'analyze_offers',
  'analyze_trafficback',
  'analyze_conversions',
  'analyze_stats',
  'workflow_analysis',
  'auto_analysis',
] as const;

// --- Setup ------------------------------------------------------------------

export function setupPromptHandlers(
  mcpServer: McpServer,
  config: { baseUrl: string; apiKey: string } | null
): void {
  // ---- analyze_offers -----------------------------------------------------
  mcpServer.registerPrompt(
    'analyze_offers',
    {
      title: 'Analyze Affise Offers',
      description: 'Analyze Affise offers data with expert recommendations',
      argsSchema: {
        offers_data:         z.string().describe('JSON offers data for analysis (required)'),
        analysis_type:       z.string().optional().describe('comprehensive | performance | market | technical | competitive | compliance'),
        focus_areas:         z.unknown().optional().describe('Focus areas (array of strings, or one string)'),
        comparison_criteria: z.string().optional().describe('Criteria for comparing offers'),
        format:              z.string().optional().describe('Output format: summary | detailed | actionable'),
      },
    },
    async (args) => {
      const format = oneOf(args.format, ['summary', 'detailed', 'actionable'] as const);
      return createOfferAnalysisPrompt({
        offers_data:         args.offers_data,
        analysis_type:       asString(args.analysis_type),
        focus_areas:         ensureOptArray<string>(args.focus_areas),
        comparison_criteria: asString(args.comparison_criteria),
        format,
      });
    }
  );

  // ---- analyze_trafficback ------------------------------------------------
  mcpServer.registerPrompt(
    'analyze_trafficback',
    {
      title: 'Analyze Affise Trafficback',
      description: 'Analyze Affise trafficback data with expert insights and optimization recommendations',
      argsSchema: {
        trafficback_data:    z.string().describe('JSON trafficback data for analysis (required)'),
        analysis_type:       z.string().optional().describe('comprehensive | geo | reason | partner | advertiser | technical | goal'),
        focus_areas:         z.unknown().optional().describe('Focus areas (e.g. ["geo_issues", "device_targeting", "partner_quality"])'),
        comparison_criteria: z.string().optional().describe('Criteria for comparing trafficback patterns'),
        format:              z.string().optional().describe('Output format: summary | detailed | actionable'),
      },
    },
    async (args) => {
      const format = oneOf(args.format, ['summary', 'detailed', 'actionable'] as const);
      const analysis_type = oneOf(args.analysis_type, [
        'comprehensive', 'geo', 'reason', 'partner', 'advertiser', 'technical', 'goal',
      ] as const);
      return createTrafficbackAnalysisPrompt({
        trafficback_data:    args.trafficback_data,
        analysis_type,
        focus_areas:         ensureOptArray<string>(args.focus_areas),
        comparison_criteria: asString(args.comparison_criteria),
        format,
      });
    }
  );

  // ---- analyze_conversions ------------------------------------------------
  mcpServer.registerPrompt(
    'analyze_conversions',
    {
      title: 'Analyze Affise Conversions',
      description:
        'Analyze raw Affise conversion records (output of affise_conversions_raw) — fraud review, ' +
        'attribution paths, partner quality, geo/tech breakdowns, payouts. Use this after fetching ' +
        'conversions to get an expert lens on per-event data.',
      argsSchema: {
        conversions_data:    z.string().describe('JSON of conversions data (typically from affise_conversions_raw result.data)'),
        analysis_type:       z.string().optional().describe('comprehensive | fraud_review | attribution | partner_quality | geo_tech | payouts'),
        focus_areas:         z.unknown().optional().describe('Focus areas (e.g. ["sub5 quality", "TR traffic", "decline reasons"])'),
        comparison_criteria: z.string().optional().describe('Side-by-side comparison criteria (e.g. "partners 3554 vs 4108")'),
        format:              z.string().optional().describe('Output format: summary | detailed | actionable (default: detailed)'),
      },
    },
    async (args) => {
      const format = oneOf(args.format, ['summary', 'detailed', 'actionable'] as const);
      const analysis_type = oneOf(args.analysis_type, [
        'comprehensive', 'fraud_review', 'attribution', 'partner_quality', 'geo_tech', 'payouts',
      ] as const);
      return createConversionsAnalysisPrompt({
        conversions_data:    args.conversions_data,
        analysis_type,
        focus_areas:         ensureOptArray<string>(args.focus_areas),
        comparison_criteria: asString(args.comparison_criteria),
        format,
      });
    }
  );

  // ---- analyze_stats ------------------------------------------------------
  mcpServer.registerPrompt(
    'analyze_stats',
    {
      title: 'Analyze Affise Stats',
      description: 'Analyze Affise statistics data with comprehensive performance insights',
      argsSchema: {
        slice:                  z.unknown().optional().describe('Array of data slicing options'),
        date_from:              z.string().optional().describe('Start date YYYY-MM-DD'),
        date_to:                z.string().optional().describe('End date YYYY-MM-DD'),
        period:                 z.string().optional().describe('Quick date range: today | yesterday | last7days | last30days | thismonth | lastmonth'),
        fields:                 z.unknown().optional().describe('Array of metrics to include'),
        currency:               z.unknown().optional().describe('Array of currency codes'),
        country:                z.unknown().optional().describe('Array of country codes'),
        offer:                  z.unknown().optional().describe('Array of offer IDs'),
        advertiser:             z.unknown().optional().describe('Array of advertiser IDs'),
        advertiser_manager_id:  z.unknown().optional(),
        affiliate:              z.unknown().optional(),
        affiliate_manager_id:   z.unknown().optional(),
        city:                   z.unknown().optional(),
        os:                     z.unknown().optional(),
        os_version:             z.unknown().optional(),
        browser:                z.unknown().optional(),
        browser_version:        z.unknown().optional(),
        device:                 z.unknown().optional(),
        device_model:           z.unknown().optional(),
        conn_type:              z.unknown().optional(),
        isp:                    z.unknown().optional(),
        landing:                z.unknown().optional(),
        prelanding:             z.unknown().optional(),
        smart_id:               z.unknown().optional(),
        sub1:                   z.unknown().optional(),
        sub2:                   z.unknown().optional(),
        sub3:                   z.unknown().optional(),
        sub4:                   z.unknown().optional(),
        sub5:                   z.unknown().optional(),
        sub6:                   z.unknown().optional(),
        sub7:                   z.unknown().optional(),
        sub8:                   z.unknown().optional(),
        goal:                   z.unknown().optional(),
        trafficback_reason:     z.unknown().optional(),
        conversionTypes:        z.unknown().optional(),
        nonzero:                z.unknown().optional().describe('Non-zero conversions only (0 or 1)'),
        page:                   z.unknown().optional(),
        limit:                  z.unknown().optional().describe('Maximum number of records'),
        orderType:              z.string().optional().describe('Sort direction: asc | desc'),
        order:                  z.unknown().optional(),
        locale:                 z.string().optional().describe('Response locale: en | ru | es'),
        timezone:               z.string().optional().describe('IANA timezone'),
        preset:                 z.string().optional().describe('Quick preset'),
        analysis_type:          z.string().optional().describe('Analysis type'),
        focus_metrics:          z.unknown().optional().describe('Specific metrics to focus on'),
        comparison_period:      z.string().optional().describe('Period to compare against'),
        format:                 z.string().optional().describe('Output format: summary | detailed | actionable | executive'),
        kpi_targets:            z.unknown().optional().describe('KPI targets object'),
      },
    },
    async (args) => {
      const format = oneOf(args.format, ['summary', 'detailed', 'actionable', 'executive'] as const);
      const period = oneOf(args.period, [
        'today', 'yesterday', 'last7days', 'last30days', 'thismonth', 'lastmonth',
      ] as const);

      let kpiTargets: { conversion_rate?: number; epc?: number; revenue_target?: number } | undefined;
      if (args.kpi_targets && typeof args.kpi_targets === 'object') {
        kpiTargets = args.kpi_targets as { conversion_rate?: number; epc?: number; revenue_target?: number };
      }

      return createStatsAnalysisPrompt({
        slice:                  ensureOptArray<SliceType>(args.slice),
        date_from:              asString(args.date_from),
        date_to:                asString(args.date_to),
        period,
        fields:                 ensureOptArray<FieldType>(args.fields),
        currency:               ensureOptArray<string>(args.currency),
        timezone:               asString(args.timezone),
        limit:                  asNumber(args.limit),

        country:                ensureOptArray<string>(args.country),
        offer:                  args.offer !== undefined && args.offer !== null
                                 ? (Array.isArray(args.offer)
                                     ? (args.offer as unknown[]).map(Number)
                                     : [Number(args.offer)])
                                 : undefined,
        advertiser:             ensureOptArray<string>(args.advertiser),
        advertiser_manager_id:  ensureOptArray<string>(args.advertiser_manager_id),
        affiliate:              ensureOptArray<string>(args.affiliate),
        affiliate_manager_id:   ensureOptArray<string>(args.affiliate_manager_id),
        city:                   ensureOptArray<string>(args.city),
        os:                     ensureOptArray<string>(args.os),
        os_version:             ensureOptArray<string>(args.os_version),
        browser:                ensureOptArray<string>(args.browser),
        browser_version:        ensureOptArray<string>(args.browser_version),
        device:                 ensureOptArray<string>(args.device),
        device_model:           ensureOptArray<string>(args.device_model),
        conn_type:              ensureOptArray<string>(args.conn_type),
        isp:                    ensureOptArray<string>(args.isp),
        landing:                ensureOptArray<string>(args.landing),
        prelanding:             ensureOptArray<string>(args.prelanding),
        smart_id:               ensureOptArray<string>(args.smart_id),
        sub1:                   ensureOptArray<string>(args.sub1),
        sub2:                   ensureOptArray<string>(args.sub2),
        sub3:                   ensureOptArray<string>(args.sub3),
        sub4:                   ensureOptArray<string>(args.sub4),
        sub5:                   ensureOptArray<string>(args.sub5),
        sub6:                   ensureOptArray<string>(args.sub6),
        sub7:                   ensureOptArray<string>(args.sub7),
        sub8:                   ensureOptArray<string>(args.sub8),
        goal:                   ensureOptArray<string>(args.goal),
        trafficback_reason:     ensureOptArray<string>(args.trafficback_reason),
        conversionTypes:        ensureOptArray<ConversionType>(args.conversionTypes),
        nonzero:                args.nonzero !== undefined ? (Number(args.nonzero) === 1 ? 1 : 0) : undefined,
        page:                   asNumber(args.page),
        orderType:              oneOf(args.orderType, ['asc', 'desc'] as const),
        order:                  ensureOptArray<string>(args.order),
        locale:                 oneOf(args.locale, ['en', 'ru', 'es'] as const),
        preset:                 asString(args.preset),

        analysis_type:          asString(args.analysis_type),
        focus_metrics:          ensureOptArray<string>(args.focus_metrics),
        comparison_period:      asString(args.comparison_period),
        format,
        kpi_targets:            kpiTargets,
      });
    }
  );

  // ---- workflow_analysis --------------------------------------------------
  mcpServer.registerPrompt(
    'workflow_analysis',
    {
      title: 'Affise Offer Search → Analysis Workflow',
      description: 'Complete workflow: search offers and analyze them step by step',
      argsSchema: {
        search_query:  z.string().optional().describe('Search query for offers'),
        countries:     z.unknown().optional().describe('Array of country codes to filter'),
        status:        z.unknown().optional().describe('Array of offer statuses (default: ["active"])'),
        analysis_type: z.string().optional().describe('Type of analysis to perform'),
        focus_areas:   z.unknown().optional().describe('Areas to focus analysis on'),
      },
    },
    async (args) => {
      const countries   = ensureArray(args.countries);
      const status      = args.status ? ensureArray(args.status) : ['active'];
      const focus_areas = ensureArray(args.focus_areas);
      return createWorkflowAnalysisPrompt({
        search_query:  asString(args.search_query),
        countries,
        status,
        analysis_type: asString(args.analysis_type),
        focus_areas,
      });
    }
  );

  // ---- auto_analysis ------------------------------------------------------
  mcpServer.registerPrompt(
    'auto_analysis',
    {
      title: 'Affise Auto-Analysis',
      description: 'Enhanced auto-analysis: offers, stats, trafficback data with comprehensive insights',
      argsSchema: {
        data_type:               z.string().optional().describe('offers | stats | trafficback | combined (default: offers)'),

        // Offer parameters
        search_query:            z.string().optional().describe('Search query for offers'),
        offer_countries:         z.unknown().optional().describe('Array of country codes for offer filtering'),
        offer_status:            z.unknown().optional().describe('Array of offer statuses (default: ["active"])'),
        offer_categories:        z.unknown().optional().describe('Array of offer categories'),

        // Stats parameters
        slice:                   z.unknown().optional().describe('Stats slicing dimensions'),
        date_from:               z.string().optional().describe('Start date for stats (YYYY-MM-DD)'),
        date_to:                 z.string().optional().describe('End date for stats (YYYY-MM-DD)'),
        period:                  z.string().optional().describe('today | yesterday | last7days | last30days | thismonth | lastmonth'),
        stats_fields:            z.unknown().optional().describe('Array of stats metrics (e.g., ["views", "clicks", "conversions", "earnings"])'),
        conversionTypes:         z.unknown().optional().describe('total | confirmed | pending | declined'),
        currency:                z.unknown().optional().describe('Array of currency codes'),
        advertiser:              z.unknown().optional().describe('Array of advertiser IDs'),
        affiliate:               z.unknown().optional().describe('Array of affiliate IDs'),
        offer:                   z.unknown().optional().describe('Offer IDs for stats filtering'),
        country:                 z.unknown().optional().describe('Array of country codes for stats filtering'),
        os:                      z.unknown().optional().describe('Array of operating systems'),
        device:                  z.unknown().optional().describe('Array of device types'),
        browser:                 z.unknown().optional().describe('Array of browser types'),
        sub1:                    z.unknown().optional().describe('Array of sub1 tracking values'),
        sub2:                    z.unknown().optional().describe('Array of sub2 tracking values'),
        sub3:                    z.unknown().optional().describe('Array of sub3 tracking values'),
        sub4:                    z.unknown().optional().describe('Array of sub4 tracking values'),
        sub5:                    z.unknown().optional().describe('Array of sub5 tracking values'),
        sub6:                    z.unknown().optional().describe('Array of sub6 tracking values'),
        sub7:                    z.unknown().optional().describe('Array of sub7 tracking values'),
        sub8:                    z.unknown().optional().describe('Array of sub8 tracking values'),
        nonzero:                 z.unknown().optional().describe('Non-zero conversions only (0 or 1)'),
        preset:                  z.string().optional().describe('Stats preset name'),

        // Trafficback parameters
        trafficback_countries:   z.unknown().optional().describe('Array of countries for trafficback analysis'),
        trafficback_offers:      z.unknown().optional().describe('Array of offers for trafficback analysis'),
        trafficback_devices:     z.unknown().optional().describe('Array of devices for trafficback analysis'),
        trafficback_os:          z.unknown().optional().describe('Array of OS for trafficback analysis'),

        // Analysis configuration
        analysis_type:           z.string().optional().describe('comprehensive | performance | revenue | quality | geographic | technical | funnel | partner | competitive | optimization'),
        focus_areas:             z.unknown().optional().describe('Array of focus areas for detailed analysis'),
        format:                  z.string().optional().describe('summary | detailed | actionable | executive'),
        comparison_period:       z.string().optional().describe('Period to compare performance against'),
        kpi_targets:             z.unknown().optional().describe('KPI targets object for performance evaluation'),

        // Pagination
        page:                    z.unknown().optional().describe('Page number for pagination'),
        limit:                   z.unknown().optional().describe('Maximum number of records to retrieve'),
        orderType:               z.string().optional().describe('asc | desc'),
        timezone:                z.string().optional().describe('Timezone for data analysis'),
      },
    },
    async (args) => {
      if (!config) {
        throw new Error('Configuration not loaded - cannot execute auto analysis');
      }

      const format = oneOf(args.format, ['summary', 'detailed', 'actionable', 'executive'] as const);
      const data_type = oneOf(args.data_type, ['offers', 'stats', 'trafficback', 'combined'] as const) ?? 'offers';
      const period = oneOf(args.period, [
        'today', 'yesterday', 'last7days', 'last30days', 'thismonth', 'lastmonth',
      ] as const);

      let kpiTargets:
        | { conversion_rate?: number; epc?: number; revenue_target?: number; ecpm_target?: number; approval_rate?: number }
        | undefined;
      if (args.kpi_targets && typeof args.kpi_targets === 'object') {
        kpiTargets = args.kpi_targets as typeof kpiTargets;
      }

      return createAutoAnalysisPrompt({
        data_type,

        // Offer parameters
        search_query:          asString(args.search_query),
        offer_countries:       ensureArray(args.offer_countries),
        offer_status:          ensureArray(args.offer_status),
        offer_categories:      ensureArray(args.offer_categories),

        // Stats parameters
        slice:                 ensureOptArray<SliceType>(args.slice),
        date_from:             asString(args.date_from),
        date_to:               asString(args.date_to),
        period,
        stats_fields:          ensureOptArray<FieldType>(args.stats_fields),
        conversionTypes:       ensureOptArray<ConversionType>(args.conversionTypes),
        currency:              ensureArray(args.currency),
        advertiser:            ensureArray(args.advertiser),
        affiliate:             ensureArray(args.affiliate),
        offer:                 ensureNumberArray(args.offer),
        country:               ensureArray(args.country),
        os:                    ensureArray(args.os),
        device:                ensureArray(args.device),
        browser:               ensureArray(args.browser),
        sub1:                  ensureArray(args.sub1),
        sub2:                  ensureArray(args.sub2),
        sub3:                  ensureArray(args.sub3),
        sub4:                  ensureArray(args.sub4),
        sub5:                  ensureArray(args.sub5),
        sub6:                  ensureArray(args.sub6),
        sub7:                  ensureArray(args.sub7),
        sub8:                  ensureArray(args.sub8),
        nonzero:               args.nonzero !== undefined ? (Number(args.nonzero) === 1 ? 1 : 0) : undefined,
        preset:                asString(args.preset),

        // Trafficback parameters
        trafficback_countries: ensureArray(args.trafficback_countries),
        trafficback_offers:    ensureNumberArray(args.trafficback_offers),
        trafficback_devices:   ensureArray(args.trafficback_devices),
        trafficback_os:        ensureArray(args.trafficback_os),

        // Analysis configuration
        analysis_type:         asString(args.analysis_type),
        focus_areas:           ensureArray(args.focus_areas),
        format,
        comparison_period:     asString(args.comparison_period),
        kpi_targets:           kpiTargets,

        // Pagination
        page:                  asNumber(args.page),
        limit:                 asNumber(args.limit),
        orderType:             oneOf(args.orderType, ['asc', 'desc'] as const),
        timezone:              asString(args.timezone),

        config,
      });
    }
  );
}

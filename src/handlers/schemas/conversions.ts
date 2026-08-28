/**
 * Schemas for conversion-level tools:
 *   - affise_conversions_raw  (/3.0/stats/conversions, listing)
 *   - affise_get_conversion   (/3.0/stats/conversionsbyid, single)
 */

import { z } from 'zod';
import {
  ORDER_TYPE_ENUM,
  CONVERSIONS_STATUS_ENUM,
  MONGOID_REGEX,
  TABULAR_OUTPUT_SCHEMA,
} from './_shared.js';

export const affise_conversions_raw = {
  title: 'Affise Raw Conversions',
  description: 'Get raw conversion records from Affise /3.0/stats/conversions. Returns individual conversion rows (one per event) with raw fields: ip, country, ua, os, device, click_time, status, sub1..sub8, custom_field_1..15, etc. Max limit 1000. Date range ≤ 365 days (≤ 63 days in raw_export mode). Use this when you need per-conversion detail; use affise_stats_raw for aggregated metrics.',
  inputSchema: {
    date_from: z.string().describe('Start date YYYY-MM-DD (required)'),
    date_to: z.string().describe('End date YYYY-MM-DD (required, ≤ date_from + 365 days)'),
    time_from: z.string().optional().describe('Optional time bound HH:MM:SS'),
    time_to: z.string().optional().describe('Optional time bound HH:MM:SS'),
    status: z.array(z.enum(CONVERSIONS_STATUS_ENUM)).optional()
      .describe('Conversion statuses to include. "total" = no filter.'),
    filter: z.object({
      partner: z.array(z.string()).optional()
        .describe('Affiliate / partner IDs (canonical filter key — NOT `affiliate`)'),
      offer: z.array(z.number()).optional(),
      advertiser: z.array(z.string()).optional(),
      supplier: z.array(z.string()).optional(),
      country: z.array(z.string()).optional(),
      city: z.array(z.string()).optional(),
      os: z.array(z.string()).optional(),
      device: z.array(z.string()).optional(),
      device_type: z.array(z.string()).optional(),
      browser: z.array(z.string()).optional(),
      goal: z.array(z.string()).optional(),
      fraud_type: z.array(z.string()).optional(),
      sub1: z.array(z.string()).optional(),
      sub2: z.array(z.string()).optional(),
      sub3: z.array(z.string()).optional(),
      sub4: z.array(z.string()).optional(),
      sub5: z.array(z.string()).optional(),
      sub6: z.array(z.string()).optional(),
      sub7: z.array(z.string()).optional(),
      sub8: z.array(z.string()).optional(),
      action_id: z.string().optional(),
      clickid: z.string().optional(),
      promocode: z.string().optional(),
      imp_id: z.string().optional(),
      invoice_id: z.string().optional(),
      user_id: z.string().optional(),
      offer_tag: z.string().optional(),
      affiliate_tag: z.string().optional(),
      advertiser_tag: z.string().optional(),
      payment_status: z.string().optional(),
      fraud_risk_level: z.string().optional(),
      decline_reason: z.string().optional(),
      smart_id: z.string().optional().describe('numeric ID, or "all_smartlinks" / "direct_traffic"'),
      payouts_from: z.number().optional(),
      payouts_to: z.number().optional(),
      shave: z.union([z.literal(0), z.literal(1)]).optional(),
    }).optional()
      .describe('Filter conditions. Sub IDs capped at sub1..sub8 by Conversion.php form.'),
    page: z.number().int().min(1).optional().describe('Page (default 1)'),
    limit: z.number().int().min(1).max(1000).optional().describe('Results per page (default 100, max 1000)'),
    order: z.string().optional().describe('Single sort field (no array)'),
    sort: z.enum(ORDER_TYPE_ENUM).optional().describe('Sort direction (default desc)'),
    timezone: z.string().optional().describe('IANA timezone'),
    currency: z.number().int().optional().describe('Currency ID'),
    fields: z.string().optional().describe('Comma-separated column selector (flattened names, e.g. "id,status,offer.id,partner.login,payouts,revenue"). Defaults to a curated ~14-column set. Pass an explicit list to export specific columns for many rows in one call; use affise_get_conversion by id for the full record.'),
    raw_export: z.union([z.literal(0), z.literal(1)]).optional()
      .describe('When 1, bypass the response mapper and return unmapped ClickHouse rows. Caps date range at 63 days.'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    // Probed 2026-05-22: partner key returns 200 + conversions scoped to
    // their own affiliate id (3 items on the test tenant).
    'affise/role': ['admin', 'partner'],
    'affise/max_date_range_days': 365,
    'affise/max_date_range_days_raw_export': 63,
    'affise/sub_filter_cap': 8,
  },
} as const;

export const affise_get_conversion = {
  title: 'Get Affise Conversion',
  description: 'Get full detail for a single conversion by its MongoId (GET /3.0/stats/conversionsbyid). Admin only. Use as drill-down from affise_conversions_raw — when a row has interesting fields and you need the complete record (offer object, all custom_field_1..15, price, etc.).',
  inputSchema: {
    id: z.string().regex(MONGOID_REGEX)
      .describe('24-char hex MongoId of the conversion (from affise_conversions_raw row id)'),
    timezone: z.string().optional().describe('IANA timezone override'),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

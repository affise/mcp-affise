/**
 * Schemas for admin-side entity catalogue + lookup tools.
 *
 *  - affise_offer_categories      (/3.0/offer/categories)
 *  - affise_get_offer             (/3.0/offer/{id})
 *  - affise_list_partners         (/3.0/admin/partners)
 *  - affise_get_partner           (/3.0/admin/partner/{id})
 *  - affise_list_advertisers      (/3.0/admin/advertisers)
 *  - affise_get_advertiser        (/3.0/admin/advertiser/{id})
 *  - affise_offer_tracking_link   (/3.0/admin/offer/{id}/tracking-link)
 */

import { z } from 'zod';
import {
  ORDER_TYPE_ENUM,
  ADVERTISER_ORDER_ENUM,
  CATEGORIES_ORDER_ENUM,
  MONGOID_REGEX,
  TABULAR_OUTPUT_SCHEMA,
} from './_shared.js';

export const affise_offer_categories = {
  title: 'Affise Offer Categories',
  description: 'Get all available offer categories from Affise',
  inputSchema: {
    ids: z.array(z.string()).optional().describe('Specific category IDs to retrieve'),
    search: z.string().optional().describe('Search term to filter categories by title'),
    page: z.number().optional().describe('Page number (default: 1)'),
    limit: z.number().optional().describe('Results per page (default: 100, max: 99999)'),
    order: z.enum(CATEGORIES_ORDER_ENUM).optional().describe('Sort field (default: id)'),
    orderType: z.enum(ORDER_TYPE_ENUM).optional().describe('Sort direction (default: asc)'),
  },
  _meta: {
    // Probed 2026-05-22: partner-accessible (read-only catalogue).
    'affise/role': ['admin', 'partner'],
  },
} as const;

export const affise_get_offer = {
  title: 'Get Affise Offer',
  description: 'Get full detail for a single offer by ID (GET /3.0/offer/{id}). Use after affise_search_offers or when an offer_id is known from a conversion row. Returns the offer object with id, title, status, payouts, targeting, etc.',
  inputSchema: {
    offer_id: z.number().int().min(1).describe('Offer ID'),
  },
  _meta: {
    // Probed 2026-05-22: partner key returns 200 for offers they have
    // access to (404 for offers outside their connected set — expected).
    'affise/role': ['admin', 'partner'],
  },
} as const;

export const affise_list_partners = {
  title: 'List Affise Partners',
  description: 'List affiliates (partners) with pagination and filters (GET /3.0/admin/partners). Admin only. Useful for "show me partners from country X with status active" or to enumerate the affiliate roster.',
  inputSchema: {
    search: z.string().optional().describe('Search by name / email'),
    id: z.array(z.number().int()).optional().describe('Filter by specific affiliate IDs'),
    manager: z.array(z.string()).optional().describe('Filter by manager user IDs'),
    status: z.string().optional().describe('Affiliate status (e.g. "active")'),
    updated_at: z.string().optional().describe('Filter by update date (YYYY-MM-DD)'),
    with_balance: z.boolean().optional().describe('Include balance field'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    limit: z.number().int().min(1).max(500).optional().describe('Results per page (default 100, max 500)'),
    order: z.string().optional().describe('Sort field'),
    orderType: z.enum(ORDER_TYPE_ENUM).optional().describe('Sort direction'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_get_partner = {
  title: 'Get Affise Partner',
  description: 'Get full detail for a single affiliate by ID (GET /3.0/admin/partner/{id}). Admin only. Use to drill down from stats slice="partner" or affise_list_partners.',
  inputSchema: {
    partner_id: z.number().int().min(1).describe('Affiliate (partner) ID'),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_list_advertisers = {
  title: 'List Affise Advertisers',
  description: 'List advertisers with pagination and filters (GET /3.0/admin/advertisers). Useful for enumerating advertisers or finding one by name. Pass with_offers=true to include offers_count per advertiser.',
  inputSchema: {
    id: z.string().optional().describe('Filter by advertiser ID (MongoId hex)'),
    name: z.string().optional().describe('Filter by advertiser title'),
    tags: z.string().optional().describe('Filter by tags'),
    updated_at: z.string().optional().describe('Filter by update date (YYYY-MM-DD)'),
    with_offers: z.boolean().optional().describe('Include offers_count per advertiser'),
    page: z.number().int().min(1).optional().describe('Page number (default 1)'),
    limit: z.number().int().min(1).max(500).optional().describe('Results per page (default 100, max 500)'),
    order: z.enum(ADVERTISER_ORDER_ENUM).optional().describe('Sort field'),
    orderType: z.enum(ORDER_TYPE_ENUM).optional().describe('Sort direction (default asc)'),
  },
  outputSchema: TABULAR_OUTPUT_SCHEMA,
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_get_advertiser = {
  title: 'Get Affise Advertiser',
  description: 'Get full detail for a single advertiser by ID (GET /3.0/admin/advertiser/{id}). Advertiser ID is a 24-char MongoId hex string (e.g. "507f1f77bcf86cd799439011"), NOT an integer.',
  inputSchema: {
    advertiser_id: z.string().regex(MONGOID_REGEX).describe('24-char hex MongoId of the advertiser'),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

export const affise_offer_tracking_link = {
  title: 'Affise Offer Tracking Link',
  description: 'Generate a tracking link for a specific offer + affiliate (POST /3.0/admin/offer/{offerId}/tracking-link). Admin/manager only. Validates that the affiliate is allowed to run the offer based on its privacy settings. Optional sub1..sub8 are appended to the resulting URL as query params.',
  inputSchema: {
    offer_id: z.number().int().min(1).describe('Offer ID (path parameter)'),
    affiliate_id: z.number().int().min(1).describe('Affiliate ID to generate the link for'),
    sub1: z.string().optional().describe('Sub parameter 1'),
    sub2: z.string().optional().describe('Sub parameter 2'),
    sub3: z.string().optional().describe('Sub parameter 3'),
    sub4: z.string().optional().describe('Sub parameter 4'),
    sub5: z.string().optional().describe('Sub parameter 5'),
    sub6: z.string().optional().describe('Sub parameter 6'),
    sub7: z.string().optional().describe('Sub parameter 7'),
    sub8: z.string().optional().describe('Sub parameter 8'),
  },
  _meta: {
    'affise/role': 'admin',
  },
} as const;

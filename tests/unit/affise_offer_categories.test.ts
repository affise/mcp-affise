/**
 * Unit tests for getOfferCategories — wraps GET /3.0/offer/categories.
 *
 * Covers URL shape, query-param serialization (including the always-set
 * defaults page/limit/orderType/order), and the accompanying helpers:
 * analyzeOfferCategories, searchCategoriesByTitle, getCategoriesByIds,
 * validateOfferCategoriesParams.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import {
  getOfferCategories,
  analyzeOfferCategories,
  searchCategoriesByTitle,
  getCategoriesByIds,
  validateOfferCategoriesParams,
} from '../../src/tools/affise_offer_categories.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'admin-key' };

function okResponse(categories: any[] = []) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, categories },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('getOfferCategories', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/offer/categories with default pagination + sort', async () => {
    await getOfferCategories(CFG, {});
    const { path, qs } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/offer/categories');
    // Defaults applied by the impl.
    expect(qs.get('page')).toBe('1');
    expect(qs.get('limit')).toBe('99999');
    expect(qs.get('order')).toBe('id');
    expect(qs.get('orderType')).toBe('asc');
  });

  it('serializes ids[] repeats + explicit page/limit/order/orderType', async () => {
    await getOfferCategories(CFG, { ids: ['1', '2', '3'], page: 2, limit: 50, order: 'title', orderType: 'desc' });
    const { qs } = captureUrl();
    expect(qs.getAll('ids[]')).toEqual(['1', '2', '3']);
    expect(qs.get('page')).toBe('2');
    expect(qs.get('limit')).toBe('50');
    expect(qs.get('order')).toBe('title');
    expect(qs.get('orderType')).toBe('desc');
  });

  it('returns error envelope when baseUrl or apiKey missing', async () => {
    const r = await getOfferCategories({ baseUrl: '', apiKey: '' }, {});
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/baseUrl|apiKey/);
  });

  it('sets api-key header', async () => {
    await getOfferCategories(CFG, {});
    const [, opts] = (mockedAxios.get as Mock).mock.calls[0];
    expect(opts.headers['api-key']).toBe('admin-key');
  });
});

describe('analyzeOfferCategories', () => {
  it('counts total + collects titles', () => {
    const out = analyzeOfferCategories([
      { id: '1', title: 'Gaming' },
      { id: '2', title: 'Finance' },
      { id: '3', title: 'Dating' },
    ] as any);
    expect(out.total).toBe(3);
    expect(out.titles).toEqual(['Gaming', 'Finance', 'Dating']);
  });

  it('returns the empty shape (total=0, no titles) for empty input', () => {
    const out = analyzeOfferCategories([]);
    expect(out.total).toBe(0);
    expect(out.titles).toEqual([]);
    expect(out.hasStatus).toBe(false);
  });

  it('flags hasStatus=true when any category carries a status field', () => {
    const out = analyzeOfferCategories([
      { id: '1', title: 'A' },
      { id: '2', title: 'B', status: 'active' },
    ] as any);
    expect(out.hasStatus).toBe(true);
  });

  it('picks mostRecent and oldestUpdate from updated_at timestamps', () => {
    const out = analyzeOfferCategories([
      { id: '1', title: 'old', updated_at: '2026-01-01T00:00:00Z' },
      { id: '2', title: 'new', updated_at: '2026-05-01T00:00:00Z' },
      { id: '3', title: 'mid', updated_at: '2026-03-01T00:00:00Z' },
    ] as any);
    expect(out.mostRecent?.title).toBe('new');
    expect(out.oldestUpdate?.title).toBe('old');
  });
});

describe('searchCategoriesByTitle', () => {
  const sample = [
    { id: '1', title: 'Gaming' },
    { id: '2', title: 'Online Gambling' },
    { id: '3', title: 'Finance' },
  ] as any[];

  it('matches by substring case-insensitively', () => {
    const out = searchCategoriesByTitle(sample, 'gambl');
    expect(out.map(c => c.id)).toEqual(['2']);
  });

  it('returns empty when no match', () => {
    expect(searchCategoriesByTitle(sample, 'cooking')).toEqual([]);
  });
});

describe('getCategoriesByIds', () => {
  it('returns categories whose id is in the requested set (preserves source order)', () => {
    const cats = [
      { id: '1', title: 'A' }, { id: '2', title: 'B' }, { id: '3', title: 'C' },
    ] as any[];
    expect(getCategoriesByIds(cats, ['3', '1']).map(c => c.title)).toEqual(['A', 'C']);
  });

  it('drops unknown ids silently', () => {
    expect(getCategoriesByIds([{ id: '1' }] as any[], ['1', '99'])).toHaveLength(1);
  });

  it('returns empty for empty input or empty id list', () => {
    expect(getCategoriesByIds([], ['1'])).toEqual([]);
    expect(getCategoriesByIds([{ id: '1' }] as any[], [])).toEqual([]);
  });
});

describe('validateOfferCategoriesParams', () => {
  it('flags non-integer / non-positive page', () => {
    const out = validateOfferCategoriesParams({ page: 0 });
    expect(out.valid).toBe(false);
    expect(out.errors.join(',')).toMatch(/[Pp]age/);
  });

  it('flags out-of-range limit', () => {
    const out = validateOfferCategoriesParams({ limit: 999999 });
    expect(out.valid).toBe(false);
    expect(out.errors.join(',')).toMatch(/[Ll]imit/);
  });

  it('accepts a clean spec', () => {
    const out = validateOfferCategoriesParams({ limit: 100, order: 'title', orderType: 'asc' });
    expect(out.valid).toBe(true);
    expect(out.errors).toEqual([]);
  });
});

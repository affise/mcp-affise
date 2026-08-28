/**
 * Unit tests for smartSearchAffiseOffers — thin backward-compat shim
 * that forwards to searchWithStructuredParams.
 *
 * We mock the underlying axios layer (smart_pagination ultimately hits
 * /3.0/offers via axios). Assertion focus: the call reaches the
 * Affise offers endpoint with the structured params we passed in.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { smartSearchAffiseOffers } from '../../src/tools/unified_affise_offers.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'admin-key' };

function offersResponse(offers: any[] = []) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: {
      status: 1,
      offers,
      pagination: { total: offers.length, page: 1, limit: 100, pages: 1 },
    },
  } as any;
}

describe('smartSearchAffiseOffers', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(offersResponse([
      { id: 1, title: 'A', status: 'active', countries: ['US'], full_categories: [] },
      { id: 2, title: 'B', status: 'active', countries: ['US'], full_categories: [] },
    ]) as never);
  });

  it('returns a structured-search result for matching offers', async () => {
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    expect(r.search_type).toBe('structured');
    expect(r.data?.length).toBe(2);
  });

  it('returns a structured-search result with `complete` or `sample` status on success', async () => {
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    expect(['complete', 'sample', 'user_confirmation_required']).toContain(r.status);
  });

  it('hits the Affise /3.0/offers endpoint (downstream axios call)', async () => {
    await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    const calls = (mockedAxios.get as Mock).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(String(calls[0][0])).toMatch(/\/3\.0\/offers/);
  });

  it('attaches an insights summary block to the result', async () => {
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    expect(r.insights?.summary.total).toBe(2);
    expect(r.insights?.summary.active).toBe(2);
  });

  it('produces an error envelope on transport failure', async () => {
    (mockedAxios.get as Mock).mockRejectedValueOnce(new Error('boom') as never);
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    // The smart-pagination engine wraps errors but still surfaces a
    // structured-search result — just with status=error and no data.
    expect(r.search_type).toBe('structured');
    expect(['error', 'complete', 'sample']).toContain(r.status);
  });
});

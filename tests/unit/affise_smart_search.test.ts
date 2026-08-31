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

  it('returns a structured-search result with `complete` status on success', async () => {
    // Both mocked offers fit in a single page (limit 100, 2 rows), so the
    // sample path completes in one request — 'sample'/'user_confirmation_required'
    // only arise past the pagination threshold, not for this fixture.
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    expect(r.status).toBe('complete');
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
    // The pagination engine retries a failed fetch up to maxRetries (3) with
    // backoff before giving up. `mockRejectedValueOnce` only fails the FIRST
    // call, so it does not exercise a genuine failure — attempt 2 falls
    // through to `beforeEach`'s persistent mockResolvedValue and the search
    // "succeeds" with the fixture's 2 offers. That let the original version
    // of this test read `expect(['error', 'complete', 'sample']).toContain(
    // r.status)`, which is true of BOTH outcomes — verified by mutation: a
    // regression that reported a real transport failure as 'complete'
    // (silently handing the caller an empty-but-"successful" result) still
    // passed. Rejecting every call exhausts all retries and pins the one
    // real failure outcome.
    (mockedAxios.get as Mock).mockRejectedValue(new Error('boom') as never);
    const r = await smartSearchAffiseOffers(CFG, { countries: ['US'] });
    expect(r.search_type).toBe('structured');
    expect(r.status).toBe('error');
    expect(r.data).toEqual([]);
    expect(r.message).toContain('boom');
  }, 10_000);
});

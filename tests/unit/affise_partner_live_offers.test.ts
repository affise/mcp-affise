/**
 * Unit tests for listPartnerLiveOffers — wraps GET /3.0/partner/live-offers.
 *
 * Mirrors the listPartnerOffers contract; only the URL path differs.
 * Param shape pinned: search, countries[], categories[], int_id[],
 * privacy[], pagination.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { listPartnerLiveOffers } from '../../src/tools/affise_partner_offers.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(offers: any[] = []) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, offers, pagination: { total_count: offers.length } },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('listPartnerLiveOffers', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse([{ id: 1 }, { id: 2 }]) as never);
  });

  it('GETs /3.0/partner/live-offers (NOT /3.0/partner/offers)', async () => {
    await listPartnerLiveOffers(CFG, {});
    const { path } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/partner/live-offers');
    expect(path).not.toContain('/3.0/partner/offers');
  });

  it('serializes search + countries[] + categories[] + pagination', async () => {
    await listPartnerLiveOffers(CFG, {
      search: 'gaming',
      countries: ['US', 'CA'],
      categories: ['1', '2'],
      page: 2,
      limit: 50,
    });
    const { qs } = captureUrl();
    expect(qs.get('q')).toBe('gaming'); // search → q on the wire
    expect(qs.getAll('countries[]')).toEqual(['US', 'CA']);
    expect(qs.getAll('categories[]')).toEqual(['1', '2']);
    expect(qs.get('page')).toBe('2');
    expect(qs.get('limit')).toBe('50');
  });

  it('returns ok with the offers array', async () => {
    const r = await listPartnerLiveOffers(CFG, {});
    expect(r.status).toBe('ok');
    expect(r.data?.offers).toHaveLength(2);
  });

  it('returns error envelope when baseUrl or apiKey missing', async () => {
    const r = await listPartnerLiveOffers({ baseUrl: '', apiKey: '' }, {});
    expect(r.status).toBe('error');
  });

  it('serializes int_id[] for direct offer lookup', async () => {
    await listPartnerLiveOffers(CFG, { int_id: [42, 100] });
    const { qs } = captureUrl();
    expect(qs.getAll('int_id[]')).toEqual(['42', '100']);
  });
});

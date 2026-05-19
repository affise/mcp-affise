/**
 * Unit tests for listPartnerOffers + listPartnerLiveOffers.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { listPartnerOffers, listPartnerLiveOffers } from '../../src/tools/affise_partner_offers.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(offers: any[] = [], pagination: any = { page: 1, per_page: 100, total_count: offers.length }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, offers, pagination },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('listPartnerOffers — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/partner/offers and serializes filters + array fields', async () => {
    await listPartnerOffers(CFG, {
      search: 'casino',
      countries: ['US', 'GB'],
      categories: ['10', '11'],
      int_id: [101, 102],
      privacy: ['public'],
      updated_at: '2026-05-01',
      from: '2026-04-01',
      to: '2026-05-01',
      caps_type: 'soft',
      caps_country: 'US',
      sort: 'payout',
      page: 2,
      limit: 50,
    });
    const { path, qs } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/partner/offers');
    expect(qs.get('q')).toBe('casino');
    expect(qs.getAll('countries[]').sort()).toEqual(['GB', 'US']);
    expect(qs.getAll('categories[]').sort()).toEqual(['10', '11']);
    expect(qs.getAll('int_id[]').sort()).toEqual(['101', '102']);
    expect(qs.getAll('privacy[]')).toEqual(['public']);
    expect(qs.get('updated_at')).toBe('2026-05-01');
    expect(qs.get('from')).toBe('2026-04-01');
    expect(qs.get('to')).toBe('2026-05-01');
    expect(qs.get('caps_type')).toBe('soft');
    expect(qs.get('caps_country')).toBe('US');
    expect(qs.get('sort')).toBe('payout');
    expect(qs.get('page')).toBe('2');
    expect(qs.get('limit')).toBe('50');
  });

  it('caps limit at 500', async () => {
    await listPartnerOffers(CFG, { limit: 9999 });
    expect(captureUrl().qs.get('limit')).toBe('500');
  });

  it('returns ok + metadata from pagination', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse([{ id: 1 }, { id: 2 }], { page: 1, per_page: 100, total_count: 2 }) as never,
    );
    const r = await listPartnerOffers(CFG, {});
    expect(r.status).toBe('ok');
    expect(r.data?.offers.length).toBe(2);
    expect(r.metadata?.total_count).toBe(2);
  });
});

describe('listPartnerLiveOffers', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/partner/live-offers (distinct path from listPartnerOffers)', async () => {
    await listPartnerLiveOffers(CFG, { search: 'gaming' });
    const { path, qs } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/partner/live-offers');
    expect(qs.get('q')).toBe('gaming');
  });

  it('403 → partner-key-required message', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await listPartnerLiveOffers(CFG, {});
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Partner.*API key required/i);
  });
});

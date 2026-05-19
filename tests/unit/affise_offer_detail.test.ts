/**
 * Unit tests for getOfferDetail — wraps GET /3.0/offer/{offerId}.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getOfferDetail } from '../../src/tools/affise_offer_detail.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function okResponse(offer: any = { id: 42, title: 'Test', status: 'active' }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 'success', offer },
  } as any;
}

describe('getOfferDetail — request', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/offer/{offer_id} with api-key header', async () => {
    await getOfferDetail(CFG, { offer_id: 42 });
    const [url, reqConfig] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.0/offer/42');
    expect((reqConfig as any).headers['api-key']).toBe('test-key');
  });

  it('returns ok with offer in data', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse({ id: 42, title: 'Foo Offer', status: 'active' }) as never,
    );
    const r = await getOfferDetail(CFG, { offer_id: 42 });
    expect(r.status).toBe('ok');
    expect(r.data?.offer).toEqual({ id: 42, title: 'Foo Offer', status: 'active' });
  });
});

describe('getOfferDetail — guards', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('rejects non-positive / non-integer offer_id', async () => {
    for (const bad of [0, -1, 1.5, 'foo', undefined as any]) {
      const r = await getOfferDetail(CFG, { offer_id: bad as any });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/offer_id/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('rejects missing baseUrl/apiKey', async () => {
    const r = await getOfferDetail({ baseUrl: '', apiKey: '' }, { offer_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/baseUrl or apiKey/);
  });
});

describe('getOfferDetail — error mapping', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('404 → forwards "Offer not found"', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any,
      data: { status: 'error', error: 'Offer not found' },
    } as never);
    const r = await getOfferDetail(CFG, { offer_id: 999 });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Offer not found');
  });

  it('401 → Authentication failed', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 401, statusText: 'Unauthorized', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getOfferDetail(CFG, { offer_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/);
  });

  it('unexpected shape (no offer field) → error', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: { status: 'success' },
    } as never);
    const r = await getOfferDetail(CFG, { offer_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/unexpected response shape/i);
  });
});

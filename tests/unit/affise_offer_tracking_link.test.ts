/**
 * Unit tests for getOfferTrackingLink — wraps
 * POST /3.0/admin/offer/{offerId}/tracking-link.
 *
 * Mocks axios.post and asserts:
 *  - URL path embeds offer_id
 *  - body contains affiliate_id + only the provided sub* keys
 *  - api-key header is forwarded
 *  - success response is unwrapped into { data.tracking_link, ... }
 *  - guards reject invalid/missing offer_id / affiliate_id
 *  - 4xx error mappings (401/403/404/400) match Affise API error shape
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getOfferTrackingLink } from '../../src/tools/affise_offer_tracking_link.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function okResponse(trackingLink = 'https://t.example.com/click?pid=2&offer_id=10') {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
    data: { status: 1, tracking_link: trackingLink },
  } as any;
}

function errorResponse(httpStatus: number, errMessage: string) {
  return {
    status: httpStatus,
    statusText: 'Error',
    headers: {},
    config: {} as any,
    data: { status: 'error', error: errMessage },
  } as any;
}

function lastPostCall() {
  const calls = (mockedAxios.post as Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1];
}

describe('getOfferTrackingLink — request shape', () => {
  beforeEach(() => {
    (mockedAxios.post as Mock).mockReset();
    (mockedAxios.post as Mock).mockResolvedValue(okResponse() as never);
  });

  it('POSTs to /3.0/admin/offer/{offerId}/tracking-link with offer_id in path', async () => {
    await getOfferTrackingLink(CFG, { offer_id: 42, affiliate_id: 7 });
    const [url] = lastPostCall();
    expect(url).toBe('https://api.example.com/3.0/admin/offer/42/tracking-link');
  });

  it('body contains affiliate_id and only the provided sub* keys', async () => {
    await getOfferTrackingLink(CFG, {
      offer_id: 10,
      affiliate_id: 99,
      sub1: 'abc',
      sub3: 'xyz',
      // sub2, sub4..sub8 deliberately omitted
    });
    const [, body] = lastPostCall();
    // Body is application/x-www-form-urlencoded (Symfony form requirement),
    // parse it back to assert structure.
    const parsed = Object.fromEntries(new URLSearchParams(body as string));
    expect(parsed).toEqual({
      affiliate_id: '99',
      sub1: 'abc',
      sub3: 'xyz',
    });
  });

  it('drops sub keys that are empty strings, null, or undefined', async () => {
    await getOfferTrackingLink(CFG, {
      offer_id: 10,
      affiliate_id: 99,
      sub1: '',
      sub2: undefined,
      sub3: null as any,
      sub4: 'kept',
    });
    const [, body] = lastPostCall();
    const parsed = Object.fromEntries(new URLSearchParams(body as string));
    expect(parsed).toEqual({ affiliate_id: '99', sub4: 'kept' });
  });

  it('sends api-key header and form-urlencoded content type', async () => {
    await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    const [, , reqConfig] = lastPostCall();
    expect((reqConfig as any).headers['api-key']).toBe('test-key');
    expect((reqConfig as any).headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});

describe('getOfferTrackingLink — success response', () => {
  beforeEach(() => {
    (mockedAxios.post as Mock).mockReset();
  });

  it('returns ok with tracking_link unwrapped into data', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce(
      okResponse('https://t.example.com/click?pid=7&offer_id=42&sub1=abc') as never,
    );
    const r = await getOfferTrackingLink(CFG, {
      offer_id: 42,
      affiliate_id: 7,
      sub1: 'abc',
    });
    expect(r.status).toBe('ok');
    expect(r.data?.tracking_link).toBe('https://t.example.com/click?pid=7&offer_id=42&sub1=abc');
    expect(r.data?.offer_id).toBe(42);
    expect(r.data?.affiliate_id).toBe(7);
  });

  it('returns error when response status is not "success"', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
      data: { status: 1 }, // tracking_link missing
    } as never);
    const r = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/unexpected response shape/i);
  });
});

describe('getOfferTrackingLink — guards', () => {
  beforeEach(() => {
    (mockedAxios.post as Mock).mockReset();
    (mockedAxios.post as Mock).mockResolvedValue(okResponse() as never);
  });

  it('rejects missing offer_id', async () => {
    const r = await getOfferTrackingLink(CFG, { affiliate_id: 1 } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/offer_id/);
    expect((mockedAxios.post as Mock).mock.calls.length).toBe(0);
  });

  it('rejects zero / negative offer_id', async () => {
    for (const bad of [0, -1, 1.5, 'foo']) {
      const r = await getOfferTrackingLink(CFG, { offer_id: bad as any, affiliate_id: 1 });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/offer_id/);
    }
    expect((mockedAxios.post as Mock).mock.calls.length).toBe(0);
  });

  it('rejects missing or invalid affiliate_id', async () => {
    const r1 = await getOfferTrackingLink(CFG, { offer_id: 1 } as any);
    expect(r1.status).toBe('error');
    expect(r1.message).toMatch(/affiliate_id/);

    const r2 = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 0 });
    expect(r2.status).toBe('error');
    expect(r2.message).toMatch(/affiliate_id/);

    expect((mockedAxios.post as Mock).mock.calls.length).toBe(0);
  });

  it('rejects missing baseUrl or apiKey', async () => {
    const r = await getOfferTrackingLink({ baseUrl: '', apiKey: '' }, {
      offer_id: 1,
      affiliate_id: 1,
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/baseUrl or apiKey/);
    expect((mockedAxios.post as Mock).mock.calls.length).toBe(0);
  });
});

describe('getOfferTrackingLink — HTTP error mapping', () => {
  beforeEach(() => {
    (mockedAxios.post as Mock).mockReset();
  });

  it('401 → Authentication failed', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce(errorResponse(401, 'Unauthorized') as never);
    const r = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/i);
  });

  it('403 → forwards "Access denied" error message', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce(errorResponse(403, 'Access denied') as never);
    const r = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Access denied');
  });

  it('404 → forwards "Offer not found" / "Affiliate not found" error', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce(errorResponse(404, 'Offer not found') as never);
    const r = await getOfferTrackingLink(CFG, { offer_id: 999, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Offer not found');
  });

  it('400 → forwards validation error', async () => {
    (mockedAxios.post as Mock).mockResolvedValueOnce(
      errorResponse(400, "Not valid 'affiliate_id'") as never,
    );
    const r = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/affiliate_id/);
  });

  it('network error (ECONNREFUSED) → friendly message', async () => {
    (mockedAxios.post as Mock).mockRejectedValueOnce(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) as never,
    );
    const r = await getOfferTrackingLink(CFG, { offer_id: 1, affiliate_id: 1 });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Unable to connect/i);
  });
});

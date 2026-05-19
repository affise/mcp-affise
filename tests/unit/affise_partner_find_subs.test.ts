/**
 * Unit tests for findPartnerSubs — wraps GET /3.0/stats/find-subs.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { findPartnerSubs } from '../../src/tools/affise_partner_find_subs.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(subs: any[] = [], pagination: any = { page: 1, per_page: 100, total_count: subs.length }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, subs, pagination },
  } as any;
}

function captureQs(): URLSearchParams {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  return new URLSearchParams(String(url).split('?')[1] || '');
}

describe('findPartnerSubs', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('passes the chosen sub_key with empty value by default', async () => {
    await findPartnerSubs(CFG, { sub_key: 'sub3' });
    const qs = captureQs();
    expect(qs.get('sub3')).toBe('');
    expect(qs.get('sub1')).toBeNull();
    expect(qs.get('page')).toBe('1');
    expect(qs.get('limit')).toBe('100');
  });

  it('passes sub_value when provided', async () => {
    await findPartnerSubs(CFG, { sub_key: 'sub2', sub_value: 'campaign-x' });
    expect(captureQs().get('sub2')).toBe('campaign-x');
  });

  it('caps limit at 500', async () => {
    await findPartnerSubs(CFG, { sub_key: 'sub1', limit: 9999 });
    expect(captureQs().get('limit')).toBe('500');
  });

  it('rejects missing or invalid sub_key', async () => {
    for (const bad of [undefined as any, '', 'sub6', 'foo', 'sub']) {
      const r = await findPartnerSubs(CFG, { sub_key: bad });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/sub_key/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('returns ok with subs + sub_key echoed back', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse(['camp-a', 'camp-b']) as never,
    );
    const r = await findPartnerSubs(CFG, { sub_key: 'sub1' });
    expect(r.status).toBe('ok');
    expect(r.data?.subs).toEqual(['camp-a', 'camp-b']);
    expect(r.data?.sub_key).toBe('sub1');
  });

  it('403 → partner-key-required', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await findPartnerSubs(CFG, { sub_key: 'sub1' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Partner.*API key required/i);
  });
});

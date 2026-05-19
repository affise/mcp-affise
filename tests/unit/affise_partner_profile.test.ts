/**
 * Unit tests for getPartnerProfile — wraps GET /3.1/partner/me.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getPartnerProfile } from '../../src/tools/affise_partner_profile.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(user: any = { id: 1, email: 'a@b.com' }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, user },
  } as any;
}

describe('getPartnerProfile', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.1/partner/me with api-key header', async () => {
    await getPartnerProfile(CFG);
    const [url, reqConfig] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.1/partner/me');
    expect((reqConfig as any).headers['api-key']).toBe('partner-key');
  });

  it('returns ok with user in data', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse({ id: 7, email: 'p@x.com', name: 'Joe', manager: { id: 1 } }) as never,
    );
    const r = await getPartnerProfile(CFG);
    expect(r.status).toBe('ok');
    expect(r.data?.user.id).toBe(7);
    expect(r.data?.user.email).toBe('p@x.com');
  });

  it('rejects missing baseUrl/apiKey', async () => {
    const r = await getPartnerProfile({ baseUrl: '', apiKey: '' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/baseUrl or apiKey/);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('403 → partner-key-required message', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getPartnerProfile(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Partner.*API key required/i);
  });

  it('401 → Authentication failed', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 401, statusText: 'Unauthorized', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getPartnerProfile(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/);
  });

  it('missing user key in 200 response → error', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: { status: 1 },
    } as never);
    const r = await getPartnerProfile(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/missing `user` key|unexpected response shape/i);
  });
});

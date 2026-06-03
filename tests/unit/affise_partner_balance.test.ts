/**
 * Unit tests for getPartnerBalance — wraps GET /3.0/balance.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getPartnerBalance } from '../../src/tools/affise_partner_balance.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'partner-key' };

function okResponse(balance: any = { withdrawal: { USD: 100 }, pending: { USD: 25 } }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, balance },
  } as any;
}

describe('getPartnerBalance', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/balance', async () => {
    await getPartnerBalance(CFG);
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.0/balance');
  });

  it('returns ok with balance map by type and currency', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse({ withdrawal: { USD: 1234.5, EUR: 100 }, pending: { USD: 50 } }) as never,
    );
    const r = await getPartnerBalance(CFG);
    expect(r.status).toBe('ok');
    expect(r.data?.balance.withdrawal.USD).toBe(1234.5);
    expect(r.data?.balance.withdrawal.EUR).toBe(100);
    expect(r.data?.balance.pending.USD).toBe(50);
  });

  it('accepts empty balance object', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: { status: 1, balance: {} },
    } as never);
    const r = await getPartnerBalance(CFG);
    expect(r.status).toBe('ok');
    expect(r.data?.balance).toEqual({});
  });

  it('403 → partner-key-required message', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getPartnerBalance(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Partner.*API key required/i);
  });

  it('missing balance key → error', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: { status: 1 },
    } as never);
    const r = await getPartnerBalance(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/missing `balance` key|unexpected response shape/i);
  });
});

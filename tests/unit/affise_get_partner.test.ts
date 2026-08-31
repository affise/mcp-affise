/**
 * Unit tests for getPartner — wraps GET /3.0/admin/partner/{id}.
 *
 * Path-segment id (not query param) and partner-payload pass-through.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getPartner } from '../../src/tools/affise_partners.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'admin-key' };

function okResponse(partner: any) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, partner },
  } as any;
}

describe('getPartner', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse({ id: 42, email: 'p@example.test' }) as never);
  });

  it('GETs /3.0/admin/partner/{id} with path-segment id', async () => {
    await getPartner(CFG, { partner_id: 42 });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.0/admin/partner/42');
  });

  it('returns ok status with partner payload', async () => {
    const r = await getPartner(CFG, { partner_id: 42 });
    expect(r.status).toBe('ok');
  });

  it('returns error envelope when baseUrl or apiKey missing', async () => {
    const r = await getPartner({ baseUrl: '', apiKey: '' }, { partner_id: 42 });
    expect(r.status).toBe('error');
  });

  it('does not append a query string (id is a path segment)', async () => {
    await getPartner(CFG, { partner_id: 99 });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).not.toContain('?');
  });

  it('sets api-key header', async () => {
    await getPartner(CFG, { partner_id: 42 });
    const [, opts] = (mockedAxios.get as Mock).mock.calls[0];
    expect(opts.headers['api-key']).toBe('admin-key');
  });
});

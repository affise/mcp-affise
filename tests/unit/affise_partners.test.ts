/**
 * Unit tests for affise_partners — listPartners + getPartner.
 *
 * Mocks axios.get and asserts URL/query shape, response unwrapping, guards,
 * and HTTP error mapping for both endpoints.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { listPartners, getPartner } from '../../src/tools/affise_partners.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function listOk(partners: any[] = [], paginationOverride: any = {}) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: {
      status: 'success',
      partners,
      pagination: { page: 1, per_page: 100, total_count: partners.length, ...paginationOverride },
    },
  } as any;
}

function detailOk(partner: any = { id: 7, name: 'P' }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 'success', partner },
  } as any;
}

function captureUrl(): URLSearchParams {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  return new URLSearchParams(String(url).split('?')[1] || '');
}

describe('listPartners — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(listOk() as never);
  });

  it('serializes search + status + updated_at + array filters + pagination', async () => {
    await listPartners(CFG, {
      search: 'john',
      status: 'active',
      updated_at: '2026-05-01',
      with_balance: true,
      id: [1, 2, 3],
      manager: ['m1', 'm2'],
      page: 2,
      limit: 50,
      order: 'id',
      orderType: 'desc',
    });
    const p = captureUrl();
    expect(p.get('search')).toBe('john');
    expect(p.get('status')).toBe('active');
    expect(p.get('updated_at')).toBe('2026-05-01');
    expect(p.get('with_balance')).toBe('1');
    expect(p.getAll('id[]').sort()).toEqual(['1', '2', '3']);
    expect(p.getAll('manager[]').sort()).toEqual(['m1', 'm2']);
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('50');
    expect(p.get('order')).toBe('id');
    expect(p.get('orderType')).toBe('desc');
  });

  it('caps limit at 500', async () => {
    await listPartners(CFG, { limit: 9999 });
    expect(captureUrl().get('limit')).toBe('500');
  });

  it('defaults page=1 limit=100 when omitted', async () => {
    await listPartners(CFG, {});
    const p = captureUrl();
    expect(p.get('page')).toBe('1');
    expect(p.get('limit')).toBe('100');
  });

  it('returns ok + metadata from pagination', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      listOk([{ id: 1 }, { id: 2 }], { page: 1, per_page: 100, total_count: 2 }) as never,
    );
    const r = await listPartners(CFG, {});
    expect(r.status).toBe('ok');
    // After compactTabular: data is {columns, rows, total, page, per_page}.
    expect((r.data as any)?.rows?.length).toBe(2);
    expect((r.data as any)?.total).toBe(2);
    expect(r.metadata?.total_count).toBe(2);
  });
});

describe('listPartners — errors', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('403 → forwards Access denied', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any,
      data: { status: 'error', error: 'Access denied' },
    } as never);
    const r = await listPartners(CFG, {});
    expect(r.status).toBe('error');
    expect(r.message).toBe('Access denied');
  });
});

describe('getPartner', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(detailOk() as never);
  });

  it('GETs /3.0/admin/partner/{id}', async () => {
    await getPartner(CFG, { partner_id: 193 });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe('https://api.example.com/3.0/admin/partner/193');
  });

  it('returns ok with partner in data', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      detailOk({ id: 193, name: 'P', country: 'US' }) as never,
    );
    const r = await getPartner(CFG, { partner_id: 193 });
    expect(r.status).toBe('ok');
    expect(r.data?.partner).toEqual({ id: 193, name: 'P', country: 'US' });
  });

  it('rejects invalid partner_id', async () => {
    for (const bad of [0, -1, 1.5, 'foo']) {
      const r = await getPartner(CFG, { partner_id: bad as any });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/partner_id/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('404 → forwards "Affiliate does not exist"', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any,
      data: { status: 'error', error: 'Affiliate does not exist' },
    } as never);
    const r = await getPartner(CFG, { partner_id: 99999 });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Affiliate does not exist');
  });
});

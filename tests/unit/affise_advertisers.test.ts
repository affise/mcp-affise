/**
 * Unit tests for affise_advertisers — listAdvertisers + getAdvertiser.
 *
 * Note: advertiser ID is a 24-char hex MongoId (NOT integer).
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { listAdvertisers, getAdvertiser } from '../../src/tools/affise_advertisers.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };
const MONGO_ID = '507f1f77bcf86cd799439011';

function listOk(advertisers: any[] = [], paginationOverride: any = {}) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: {
      status: 'success',
      advertisers,
      pagination: { page: 1, per_page: 100, total_count: advertisers.length, ...paginationOverride },
    },
  } as any;
}

function detailOk(advertiser: any = { id: MONGO_ID, title: 'A' }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 'success', advertiser },
  } as any;
}

function captureUrl(): URLSearchParams {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  return new URLSearchParams(String(url).split('?')[1] || '');
}

describe('listAdvertisers — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(listOk() as never);
  });

  it('serializes id/name/tags/updated_at/with_offers + pagination + sort', async () => {
    await listAdvertisers(CFG, {
      id: MONGO_ID,
      name: 'AdCo',
      tags: 'vip',
      updated_at: '2026-05-01',
      with_offers: true,
      page: 2,
      limit: 25,
      order: 'title',
      orderType: 'desc',
    });
    const p = captureUrl();
    expect(p.get('id')).toBe(MONGO_ID);
    expect(p.get('name')).toBe('AdCo');
    expect(p.get('tags')).toBe('vip');
    expect(p.get('updated_at')).toBe('2026-05-01');
    expect(p.get('with_offers')).toBe('1');
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('25');
    expect(p.get('order')).toBe('title');
    expect(p.get('orderType')).toBe('desc');
  });

  it('rejects invalid order value before hitting API', async () => {
    const r = await listAdvertisers(CFG, { order: 'banana' as any });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/order must be one of/);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('caps limit at 500', async () => {
    await listAdvertisers(CFG, { limit: 9999 });
    expect(captureUrl().get('limit')).toBe('500');
  });

  it('returns ok + advertisers list', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      listOk([{ id: MONGO_ID, title: 'A' }, { id: 'b'.repeat(24), title: 'B' }]) as never,
    );
    const r = await listAdvertisers(CFG, {});
    expect(r.status).toBe('ok');
    // After compactTabular: data is {columns, rows, total, page, per_page}.
    expect((r.data as any)?.rows?.length).toBe(2);
    expect((r.data as any)?.columns).toEqual(expect.arrayContaining(['id', 'title']));
  });
});

describe('getAdvertiser', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(detailOk() as never);
  });

  it('GETs /3.0/admin/advertiser/{id} (MongoId path)', async () => {
    await getAdvertiser(CFG, { advertiser_id: MONGO_ID });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(url).toBe(`https://api.example.com/3.0/admin/advertiser/${MONGO_ID}`);
  });

  it('rejects non-MongoId advertiser_id', async () => {
    for (const bad of ['', '123', 'not-a-mongo-id', '507f1f77bcf86cd79943901', '!'.repeat(24)]) {
      const r = await getAdvertiser(CFG, { advertiser_id: bad as any });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/MongoId/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('returns ok with advertiser in data', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      detailOk({ id: MONGO_ID, title: 'Foo Corp' }) as never,
    );
    const r = await getAdvertiser(CFG, { advertiser_id: MONGO_ID });
    expect(r.status).toBe('ok');
    expect(r.data?.advertiser).toEqual({ id: MONGO_ID, title: 'Foo Corp' });
  });

  it('404 → forwards "Advertiser not found"', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any,
      data: { status: 'error', error: 'Advertiser not found' },
    } as never);
    const r = await getAdvertiser(CFG, { advertiser_id: MONGO_ID });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Advertiser not found');
  });
});

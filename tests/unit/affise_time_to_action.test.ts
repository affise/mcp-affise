/**
 * Unit tests for getTimeToAction — wraps GET /3.0/stats/time-to-action.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getTimeToAction } from '../../src/tools/affise_time_to_action.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function okResponse(data: any = { data: [] }) {
  return { status: 200, statusText: 'OK', headers: {}, config: {} as any, data } as any;
}

function captureUrl(): URLSearchParams {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  return new URLSearchParams(String(url).split('?')[1] || '');
}

describe('getTimeToAction — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('serializes required + optional params', async () => {
    await getTimeToAction(CFG, {
      date_from: '2026-04-01',
      date_to:   '2026-05-01',
      offer_id:  42,
      timezone:  'UTC',
      affiliate_ids: '7,8',
      goal:      'install',
      page: 2,
      limit: 50,
    });
    const p = captureUrl();
    expect(p.get('date_from')).toBe('2026-04-01');
    expect(p.get('date_to')).toBe('2026-05-01');
    expect(p.get('offer_id')).toBe('42');
    expect(p.get('timezone')).toBe('UTC');
    expect(p.get('affiliate_ids')).toBe('7,8');
    expect(p.get('goal')).toBe('install');
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('50');
  });

  it('caps limit at 500', async () => {
    await getTimeToAction(CFG, { date_from: '2026-04-01', date_to: '2026-05-01', offer_id: 1, limit: 9999 });
    expect(captureUrl().get('limit')).toBe('500');
  });
});

describe('getTimeToAction — guards', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('rejects missing date_from / date_to', async () => {
    const r = await getTimeToAction(CFG, { offer_id: 1 } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/date_from.*date_to/);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('rejects invalid offer_id', async () => {
    for (const bad of [0, -1, 1.5, undefined as any]) {
      const r = await getTimeToAction(CFG, {
        date_from: '2026-04-01', date_to: '2026-05-01', offer_id: bad as any,
      });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/offer_id/);
    }
  });
});

describe('getTimeToAction — compactTabular output', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('compacts {data: [...], pagination} into the {columns, rows, total, page, per_page} grid', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(okResponse({
      status: 1,
      statusCode: 200,
      data: [
        {
          affiliate_id: 4, clicks: 9880, total_conversions: 117,
          tta_30s: 0, tta_10m: 0, tta_1h: 112, tta_2h: 0, tta_12h: 0,
          tta_1d: 0, tta_2d: 0, tta_30d: 5, tta_inf: 0,
          affiliate_name: 'aff-a', affiliate_email: 'a@example.com',
        },
        {
          affiliate_id: 7, clicks: 512, total_conversions: 9,
          tta_30s: 0, tta_10m: 2, tta_1h: 7, tta_2h: 0, tta_12h: 0,
          tta_1d: 0, tta_2d: 0, tta_30d: 0, tta_inf: 0,
          affiliate_name: 'aff-b', affiliate_email: 'b@example.com',
        },
      ],
      pagination: { total_count: 25, per_page: 3, page: 1, next_page: 2 },
    }) as never);

    const r = await getTimeToAction(CFG, {
      date_from: '2026-06-30', date_to: '2026-07-07', offer_id: 1085, limit: 3,
    });

    expect(r.status).toBe('ok');
    expect(r.data.columns).toContain('affiliate_id');
    expect(r.data.columns).toContain('tta_1h');
    expect(r.data.rows).toHaveLength(2);
    expect(r.data.total).toBe(25);
    expect(r.data.page).toBe(1);
    expect(r.data.per_page).toBe(3);
    // all-zero buckets across every row get dropped (variant B)
    expect(r.data.dropped_columns).toEqual(
      expect.arrayContaining(['tta_30s', 'tta_2h', 'tta_12h', 'tta_1d', 'tta_2d', 'tta_inf'])
    );
  });

  it('returns an empty grid for an offer with no TTA rows', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(okResponse({
      status: 1, statusCode: 200, data: [],
      pagination: { total_count: 0, per_page: 100, page: 1 },
    }) as never);
    const r = await getTimeToAction(CFG, {
      date_from: '2026-06-30', date_to: '2026-07-07', offer_id: 69,
    });
    expect(r.status).toBe('ok');
    expect(r.data.columns).toEqual([]);
    expect(r.data.rows).toEqual([]);
    expect(r.data.total).toBe(0);
  });
});

describe('getTimeToAction — error mapping', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('404 → CTIT feature disabled message', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getTimeToAction(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01', offer_id: 1,
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/CTIT|not enabled/i);
  });

  it('401 → Authentication failed', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 401, statusText: 'Unauthorized', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getTimeToAction(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01', offer_id: 1,
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/);
  });
});

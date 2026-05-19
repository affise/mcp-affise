/**
 * URL serialization tests for getAffiseConversions.
 * Mocks axios and asserts the exact query-string pairs sent to /3.0/stats/conversions.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getAffiseConversions } from '../../src/tools/affise_conversions.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function emptyOk() {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
    data: { conversions: [], pagination: { count: 0, pages: 0 } },
  } as any;
}

function captureUrl(): URLSearchParams {
  const call = (mockedAxios.get as Mock).mock.calls[0];
  const url = call[0] as string;
  const qs = url.split('?')[1] || '';
  return new URLSearchParams(qs);
}

describe('getAffiseConversions — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
  });

  it('serializes dates + status (names → numeric codes) + partner + sub1', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      status: ['confirmed', 'pending'],
      partner: ['193', '194'],
      sub1: ['abc'],
    });

    const p = captureUrl();
    expect(p.get('date_from')).toBe('2026-04-01');
    expect(p.get('date_to')).toBe('2026-05-01');
    // confirmed=1, pending=2
    expect(p.getAll('status[]').sort()).toEqual(['1', '2']);
    expect(p.getAll('partner[]').sort()).toEqual(['193', '194']);
    expect(p.getAll('sub1[]')).toEqual(['abc']);
    // defaults
    expect(p.get('page')).toBe('1');
    expect(p.get('limit')).toBe('100');
  });

  it('status "total" is dropped (means no filter)', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      status: ['total'],
    });
    const p = captureUrl();
    expect(p.getAll('status[]')).toEqual([]);
  });

  it('all status name → code mappings are correct', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      status: ['confirmed', 'pending', 'declined', 'not_found', 'hold'],
    });
    const p = captureUrl();
    expect(p.getAll('status[]').sort()).toEqual(['1', '2', '3', '4', '5']);
  });

  it('caps limit at 1000 even if caller asks more', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      limit: 50000,
    });
    expect(captureUrl().get('limit')).toBe('1000');
  });

  it('serializes scalar identifier filters as filter[key]=value (no brackets)', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      clickid: 'cl-123',
      action_id: 'act-456',
      promocode: 'SUMMER',
    });
    const p = captureUrl();
    expect(p.get('clickid')).toBe('cl-123');
    expect(p.get('action_id')).toBe('act-456');
    expect(p.get('promocode')).toBe('SUMMER');
    // and NOT as array form
    expect(p.getAll('clickid[]')).toEqual([]);
  });

  it('serializes raw_export=1 and offer/country arrays', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      raw_export: 1,
      offer: [123, 456],
      country: ['US', 'GB'],
    });
    const p = captureUrl();
    expect(p.get('raw_export')).toBe('1');
    expect(p.getAll('offer[]').sort()).toEqual(['123', '456']);
    expect(p.getAll('country[]').sort()).toEqual(['GB', 'US']);
  });

  it('serializes payouts range as scalar bounds', async () => {
    await getAffiseConversions(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-05-01',
      payouts_from: 10,
      payouts_to: 100,
    });
    const p = captureUrl();
    expect(p.get('payouts_from')).toBe('10');
    expect(p.get('payouts_to')).toBe('100');
  });
});

describe('getAffiseConversions — guards', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
  });

  it('rejects when date_from or date_to is missing', async () => {
    const r = await getAffiseConversions(CFG, { date_from: '', date_to: '' } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/required/i);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('rejects date range > 365 days (normal mode)', async () => {
    const r = await getAffiseConversions(CFG, {
      date_from: '2024-01-01',
      date_to: '2026-01-02',
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/365 days/);
  });

  it('rejects date range > 63 days in raw_export mode', async () => {
    const r = await getAffiseConversions(CFG, {
      date_from: '2026-01-01',
      date_to: '2026-04-01',
      raw_export: 1,
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/63 days|raw_export/);
  });

  it('allows exactly 365 days', async () => {
    const r = await getAffiseConversions(CFG, {
      date_from: '2025-01-01',
      date_to: '2026-01-01',
    });
    expect(r.status).toBe('ok');
  });

  it('allows exactly 63 days in raw_export', async () => {
    const r = await getAffiseConversions(CFG, {
      date_from: '2026-03-01',
      date_to: '2026-05-03',
      raw_export: 1,
    });
    expect(r.status).toBe('ok');
  });

  it('returns error on 401 from server', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 401, statusText: 'Unauthorized', headers: {}, config: {}, data: {},
    } as never);
    const r = await getAffiseConversions(CFG, {
      date_from: '2026-04-01', date_to: '2026-04-30',
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/);
  });
});

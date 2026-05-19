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

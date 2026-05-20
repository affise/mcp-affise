/**
 * Unit tests for getRetentionRate — wraps GET /3.0/stats/retentionrate.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getRetentionRate } from '../../src/tools/affise_retention.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function okResponse(data: any = { data: [] }) {
  return { status: 200, statusText: 'OK', headers: {}, config: {} as any, data } as any;
}

function captureUrl(): URLSearchParams {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  return new URLSearchParams(String(url).split('?')[1] || '');
}

describe('getRetentionRate — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('serializes required fields + events[] array notation + optional filters', async () => {
    await getRetentionRate(CFG, {
      date_from: '2026-04-01',
      date_to:   '2026-05-01',
      offer: 42,
      base_event: 'install',
      events: ['level_up', 'purchase'],
      timezone:  'UTC',
      affiliate_id: 7,
      describe: true,
      page: 2,
      limit: 50,
    });
    const p = captureUrl();
    expect(p.get('date_from')).toBe('2026-04-01');
    expect(p.get('date_to')).toBe('2026-05-01');
    expect(p.get('offer')).toBe('42');
    expect(p.get('base_event')).toBe('install');
    // events serialized as repeated events[]=... per public docs (Array[string])
    expect(p.getAll('events[]').sort()).toEqual(['level_up', 'purchase']);
    expect(p.get('events')).toBeNull();
    expect(p.get('timezone')).toBe('UTC');
    expect(p.get('affiliate_id')).toBe('7');
    expect(p.get('describe')).toBe('1');
    expect(p.get('page')).toBe('2');
    expect(p.get('limit')).toBe('50');
  });

  it('caps limit at 100', async () => {
    await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'install', events: ['level_up'], limit: 9999,
    });
    expect(captureUrl().get('limit')).toBe('100');
  });
});

describe('getRetentionRate — guards', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  const BASE = { date_from: '2026-04-01', date_to: '2026-05-01' };

  it('rejects missing date_from / date_to', async () => {
    const r = await getRetentionRate(CFG, {
      offer: 1, base_event: 'i', events: ['a'],
    } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/date_from.*date_to/);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('rejects missing/invalid offer', async () => {
    for (const bad of [0, -1, 1.5, undefined as any]) {
      const r = await getRetentionRate(CFG, { ...BASE, offer: bad as any, base_event: 'i', events: ['a'] });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/offer/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('rejects missing base_event', async () => {
    const r = await getRetentionRate(CFG, { ...BASE, offer: 1, base_event: '', events: ['a'] } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/base_event/);
  });

  it('rejects non-array events', async () => {
    const r = await getRetentionRate(CFG, { ...BASE, offer: 1, base_event: 'i', events: 'a' } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/events.*array/);
  });

  it('rejects empty events array', async () => {
    const r = await getRetentionRate(CFG, { ...BASE, offer: 1, base_event: 'i', events: [] });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/events/);
  });
});

describe('getRetentionRate — error mapping', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('401 → Authentication failed', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 401, statusText: 'Unauthorized', headers: {}, config: {} as any, data: {},
    } as never);
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['a'],
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Authentication failed/);
  });

  it('403 → forwards Access denied', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any,
      data: { error: 'Access denied' },
    } as never);
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['a'],
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Access denied/);
  });

  it('400 with .error detail → forwards as "API error: 400 — <detail>"', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 400, statusText: 'Bad Request', headers: {}, config: {} as any,
      data: { error: 'unknown event name: foo' },
    } as never);
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['foo'],
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Retention rate API error: 400/);
    expect(r.message).toMatch(/unknown event name: foo/);
  });

  it('500 without detail → falls back to statusText', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 500, statusText: 'Internal Server Error', headers: {}, config: {} as any,
      data: {},
    } as never);
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['a'],
    });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Retention rate API error: 500.*Internal Server Error/);
  });

  it('network error (ECONNREFUSED) → mapped via mapNetworkError', async () => {
    (mockedAxios.get as Mock).mockRejectedValueOnce({
      code: 'ECONNREFUSED',
      message: 'connect ECONNREFUSED 127.0.0.1:80',
    });
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['a'],
    });
    expect(r.status).toBe('error');
    expect(r.message).toBeTruthy();
  });
});

describe('getRetentionRate — happy path', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('200 → returns ok with Go API response under data', async () => {
    const apiPayload = {
      data: [
        { day: 0, retention: 1.0 },
        { day: 1, retention: 0.78 },
        { day: 7, retention: 0.42 },
      ],
    };
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: apiPayload,
    } as never);
    const r = await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'install', events: ['login', 'purchase'],
    });
    expect(r.status).toBe('ok');
    expect(r.message).toMatch(/Retention rate retrieved/);
    expect(r.data).toEqual(apiPayload);
  });

  it('sends api-key header and Accept: application/json', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {} as any,
      data: { data: [] },
    } as never);
    await getRetentionRate(CFG, {
      date_from: '2026-04-01', date_to: '2026-05-01',
      offer: 1, base_event: 'i', events: ['a'],
    });
    const [, reqConfig] = (mockedAxios.get as Mock).mock.calls[0];
    expect((reqConfig as any).headers['api-key']).toBe('test-key');
    expect((reqConfig as any).headers['Accept']).toBe('application/json');
  });
});

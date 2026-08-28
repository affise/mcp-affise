/**
 * Unit tests for getRetentionRate — wraps GET /3.0/stats/retentionrate.
 *
 * Two surface contracts the upstream Go endpoint cares about:
 *   1. parameter rename: MCP-side `offer_id` → wire `offer`
 *   2. events serialized as repeated `events[]=name` form fields
 *      (Symfony array binding), NOT as comma-separated.
 *
 * Both are easy to break in a refactor; the tests pin them.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getRetentionRate } from '../../src/tools/affise_retention.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'admin-key' };

const VALID_PARAMS = {
  date_from: '2026-04-01',
  date_to:   '2026-04-30',
  offer_id:  101,
  base_event: 'install',
  events: ['login', 'purchase'],
};

function okResponse() {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, data: [] },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('getRetentionRate', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/stats/retentionrate', async () => {
    await getRetentionRate(CFG, VALID_PARAMS);
    const { path } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/stats/retentionrate');
  });

  it('renames MCP-side offer_id → wire offer (the Go endpoint expects `offer=`)', async () => {
    await getRetentionRate(CFG, VALID_PARAMS);
    const { qs } = captureUrl();
    expect(qs.get('offer')).toBe('101');
    expect(qs.has('offer_id')).toBe(false);
  });

  it('serializes events as repeated events[]= entries', async () => {
    await getRetentionRate(CFG, VALID_PARAMS);
    const { qs } = captureUrl();
    expect(qs.getAll('events[]')).toEqual(['login', 'purchase']);
  });

  it('serializes optional timezone / affiliate_id / describe / pagination', async () => {
    await getRetentionRate(CFG, {
      ...VALID_PARAMS,
      timezone: 'Europe/Madrid',
      affiliate_id: 12345,
      describe: true,
      page: 2,
      limit: 50,
    });
    const { qs } = captureUrl();
    expect(qs.get('timezone')).toBe('Europe/Madrid');
    expect(qs.get('affiliate_id')).toBe('12345');
    expect(qs.get('describe')).toBe('1');
    expect(qs.get('page')).toBe('2');
    expect(qs.get('limit')).toBe('50');
  });

  it('returns error when required date_from is missing', async () => {
    const r = await getRetentionRate(CFG, { ...VALID_PARAMS, date_from: undefined } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/date_from/);
  });

  it('returns error when offer_id is not a positive integer', async () => {
    const r = await getRetentionRate(CFG, { ...VALID_PARAMS, offer_id: 0 } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/offer_id/);
  });

  it('returns error when events array is empty', async () => {
    const r = await getRetentionRate(CFG, { ...VALID_PARAMS, events: [] } as any);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/events/);
  });

  it('returns error envelope when baseUrl or apiKey missing', async () => {
    const r = await getRetentionRate({ baseUrl: '', apiKey: '' }, VALID_PARAMS);
    expect(r.status).toBe('error');
  });
});

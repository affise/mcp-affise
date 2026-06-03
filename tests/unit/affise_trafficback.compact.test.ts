/**
 * Tests for getTrafficbackStats — focuses on the compactTabular wrapping
 * applied to the response.data, plus a couple of basic URL serialization
 * sanity checks. Trafficback didn't have its own test file before; this
 * is the first.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getTrafficbackStats } from '../../src/tools/affise_trafficback.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function mockOk(payload: any) {
  (mockedAxios.get as Mock).mockResolvedValueOnce({
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
    data: payload,
  } as never);
}

function captureUrl(): URLSearchParams {
  const call = (mockedAxios.get as Mock).mock.calls[0];
  const url = call[0] as string;
  const qs = url.split('?')[1] || '';
  return new URLSearchParams(qs);
}

describe('getTrafficbackStats — compactTabular wrapping', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('returns compact tabular shape on success', async () => {
    mockOk({
      stats: [
        { country: 'US', trafficback: 10, trafficback_reason: 'no_offer', clicks: 100, declined: 0 },
        { country: 'UK', trafficback: 5,  trafficback_reason: 'capped',   clicks: 50,  declined: 0 },
        { country: 'DE', trafficback: 3,  trafficback_reason: 'no_offer', clicks: 30,  declined: 0 },
      ],
      pagination: { count: 3, pages: 1, page: 1, per_page: 100 },
    });

    const result = await getTrafficbackStats(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    } as any);

    expect(result.status).toBe('ok');
    const data = result.data as any;
    expect(data.columns).toBeDefined();
    expect(data.rows).toHaveLength(3);
    // Active columns: country, trafficback, trafficback_reason, clicks
    expect(data.columns.sort()).toEqual(['clicks', 'country', 'trafficback', 'trafficback_reason']);
    // 'declined' was 0 in every row → reported as dropped
    expect(data.dropped_columns).toEqual(['declined']);
  });

  it('preserves analysis_summary metadata (top_reasons, affected_geos) computed before compaction', async () => {
    mockOk({
      stats: [
        { country: 'US', trafficback: 100, trafficback_reason: 'no_offer' },
        { country: 'UK', trafficback: 50,  trafficback_reason: 'capped' },
        { country: 'DE', trafficback: 25,  trafficback_reason: 'no_offer' },
      ],
      pagination: { count: 3 },
    });

    const result = await getTrafficbackStats(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    } as any);

    expect(result.status).toBe('ok');
    expect(result.metadata?.analysis_summary?.total_trafficback).toBe(175);
    expect(result.metadata?.analysis_summary?.top_reasons).toEqual(
      expect.arrayContaining(['no_offer', 'capped'])
    );
    expect(result.metadata?.analysis_summary?.affected_geos).toEqual(
      expect.arrayContaining(['US', 'UK', 'DE'])
    );
  });

  it('forwards pagination into compact result', async () => {
    mockOk({
      stats: [{ country: 'US', trafficback: 1 }],
      pagination: { count: 42, page: 2, per_page: 10 },
    });

    const result = await getTrafficbackStats(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      page: 2,
      limit: 10,
    } as any);

    expect(result.status).toBe('ok');
    const data = result.data as any;
    expect(data.total).toBe(42);
    expect(data.page).toBe(2);
    expect(data.per_page).toBe(10);
  });

  it('builds the expected URL with filter[country][] and filter[partner][]', async () => {
    mockOk({ stats: [], pagination: { count: 0 } });

    await getTrafficbackStats(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      country: ['US', 'GB'],
      partner: ['193'],
    } as any);

    const p = captureUrl();
    expect(p.getAll('filter[country][]').sort()).toEqual(['GB', 'US']);
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
  });

  it('returns error response when stats missing from server payload', async () => {
    mockOk({ pagination: { count: 0 } } as any);

    const result = await getTrafficbackStats(CFG, {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    } as any);

    expect(result.status).toBe('error');
    expect(result.message).toMatch(/Invalid response format/);
  });
});

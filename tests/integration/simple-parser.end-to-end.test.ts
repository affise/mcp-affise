/**
 * End-to-end test for the natural-language affise_stats path:
 * query string → parseQuery → toStatsParams → EnhancedToolHandler.executeTool
 * → mocked axios.
 *
 * Verifies that filter conditions parsed from prose / key=value forms make
 * it all the way into filter[partner][], filter[os][], etc. on the wire.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { EnhancedToolHandler } from '../../src/handlers/enhanced-tools.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function emptyOk() {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
    data: { stats: [], pagination: { count: 0, pages: 1 } },
  } as any;
}

function captureUrl(): URLSearchParams {
  const call = (mockedAxios.get as Mock).mock.calls[0];
  const url = call[0] as string;
  const qs = url.split('?')[1] || '';
  return new URLSearchParams(qs);
}

describe('affise_stats (NL) end-to-end → URL', () => {
  let handler: EnhancedToolHandler;

  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
    handler = new EnhancedToolHandler(CFG);
  });

  it('key=value filters propagate to filter[partner][], filter[os][]', async () => {
    const result = await handler.executeTool('affise_stats', {
      query: 'show stats for affiliate=193 os=Unknown last week',
    });
    expect(result.status).toBe('ok');

    const p = captureUrl();
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
    expect(p.getAll('filter[os][]')).toEqual(['Unknown']);
  });

  it('prose form "for affiliate 193" still resolves to partner', async () => {
    const result = await handler.executeTool('affise_stats', {
      query: 'revenue for affiliate 193 last month',
    });
    expect(result.status).toBe('ok');

    const p = captureUrl();
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
  });

  it('legacy "gaming offers in US for mobile" path still works (regression)', async () => {
    const result = await handler.executeTool('affise_stats', {
      query: 'gaming offers in US for mobile last 7 days',
    });
    expect(result.status).toBe('ok');

    const p = captureUrl();
    expect(p.getAll('filter[country][]')).toEqual(['US']);
    expect(p.getAll('filter[device][]')).toEqual(['mobile']);
  });

  it('combines explicit dimensions ("top 10 partners") with key=value filters', async () => {
    const result = await handler.executeTool('affise_stats', {
      query: 'top 10 partners by clicks last month partner=193',
    });
    expect(result.status).toBe('ok');

    const p = captureUrl();
    // "top 10 partners" → affiliate dimension in slice
    expect(p.getAll('slice[]')).toContain('affiliate');
    // partner=193 filter
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
  });

  it('multiple values: partner=193,194', async () => {
    const result = await handler.executeTool('affise_stats', {
      query: 'stats for partner=193,194 last week',
    });
    expect(result.status).toBe('ok');

    const p = captureUrl();
    expect(p.getAll('filter[partner][]').sort()).toEqual(['193', '194']);
  });
});

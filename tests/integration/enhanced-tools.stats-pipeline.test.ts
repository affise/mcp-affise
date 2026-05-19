/**
 * Integration test: full affise_stats_raw pipeline through EnhancedToolHandler.
 *
 * Exercises validateRawStatsParams → normalizeStatsParams → URL builder
 * end-to-end with a mocked axios. This is the level of coverage that would
 * have caught the SecureInputValidator routing bug (validateObject treating
 * arrays as objects) — the unit-level tests in affise_custom_stats.url.test.ts
 * skip validation entirely.
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

describe('affise_stats_raw full pipeline', () => {
  let handler: EnhancedToolHandler;

  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
    handler = new EnhancedToolHandler(CFG);
  });

  it('golden case from spec: arrays + nested filter → correct URL, status ok', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day', 'country'],
      fields: ['clicks', 'conversions'],
      filter: { partner: ['193'], os: ['Unknown'], sub5: ['abc'] },
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('slice[]')).toEqual(['day', 'country']);
    expect(p.getAll('fields[]')).toEqual(['clicks', 'conversions']);
    expect(p.get('filter[date_from]')).toBe('2026-04-01');
    expect(p.get('filter[date_to]')).toBe('2026-05-12');
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
    expect(p.getAll('filter[os][]')).toEqual(['Unknown']);
    expect(p.getAll('filter[sub5][]')).toEqual(['abc']);
  });

  it('numeric-keyed objects (original user-reported bug) → coerced to arrays', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: { 0: 'day', 1: 'country' },
      fields: { 0: 'clicks' },
      filter: { partner: { 0: '193' } },
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('slice[]')).toEqual(['day', 'country']);
    expect(p.getAll('fields[]')).toEqual(['clicks']);
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
  });

  it('legacy affiliate alias rewrites to filter[partner][]', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day'],
      filter: { affiliate: ['193'] },
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
    expect(p.getAll('filter[affiliate][]')).toEqual([]); // not present
  });

  it('slice by sub30 is accepted (slice allows sub1..sub30)', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day', 'sub30'],
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('slice[]')).toEqual(['day', 'sub30']);
  });

  it('filter does NOT serialize sub9..sub30 (Filter.php capped at sub8)', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day'],
      filter: { sub15: ['ignored'], sub30: ['ignored'] } as any,
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('filter[sub15][]')).toEqual([]);
    expect(p.getAll('filter[sub30][]')).toEqual([]);
  });

  it('order with - prefix passes through as DESC indicator', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day'],
      order: ['-clicks', 'country'],
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('order[]')).toEqual(['-clicks', 'country']);
  });

  it('passes metadata (date_range, page_info, filters_applied) through from inner tool', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {},
      data: { stats: [{ slice: { day: 1 }, traffic: { raw: 10 } }], pagination: { count: 1, pages: 1 } },
    } as never);

    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      slice: ['day'],
      partner: ['193'],
    } as any);

    expect(result.status).toBe('ok');
    expect(result.metadata).toBeDefined();
    expect(result.metadata.date_range).toBe('2026-04-01 to 2026-04-30');
    expect(result.metadata.slice_by).toEqual(['day']);
    expect(result.metadata.filters_applied).toEqual(
      expect.arrayContaining([expect.stringMatching(/partner/)])
    );
    expect(result.metadata.page_info).toEqual(
      expect.objectContaining({ current_page: 1, per_page: 100 })
    );
  });

  it('flat affiliate at top level (no nested filter) still works', async () => {
    const result = await handler.executeTool('affise_stats_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      slice: ['day'],
      affiliate: ['193'],
    } as any);

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
  });
});

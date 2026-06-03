/**
 * Tests for getAffiseCustomStats URL serialization.
 * Mocks axios; asserts exact filter[], slice[], fields[] pairs in the request URL.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getAffiseCustomStats } from '../../src/tools/affise_custom_stats.js';

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

describe('getAffiseCustomStats — URL serialization', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
  });

  it('golden case from spec: slice/fields/filter[partner]/filter[os]/filter[sub5]', async () => {
    await getAffiseCustomStats(CFG, {
      slice: ['day', 'country'],
      fields: ['clicks', 'conversions'],
      date_from: '2026-01-01',
      date_to: '2026-05-12',
      partner: ['193'],
      os: ['Unknown'],
      sub5: ['abc'],
    } as any);

    const p = captureUrl();
    expect(p.getAll('slice[]')).toEqual(['day', 'country']);
    expect(p.getAll('fields[]')).toEqual(['clicks', 'conversions']);
    expect(p.get('filter[date_from]')).toBe('2026-01-01');
    expect(p.get('filter[date_to]')).toBe('2026-05-12');
    expect(p.getAll('filter[partner][]')).toEqual(['193']);
    expect(p.getAll('filter[os][]')).toEqual(['Unknown']);
    expect(p.getAll('filter[sub5][]')).toEqual(['abc']);
  });

  it('slice by sub30 (valid as slice, not as filter)', async () => {
    await getAffiseCustomStats(CFG, {
      slice: ['day', 'sub30'],
      date_from: '2026-04-01',
      date_to: '2026-05-12',
    } as any);

    const p = captureUrl();
    expect(p.getAll('slice[]')).toEqual(['day', 'sub30']);
  });

  it('order with - prefix passes through', async () => {
    await getAffiseCustomStats(CFG, {
      slice: ['day'],
      order: ['-clicks', 'country'],
      date_from: '2026-04-01',
      date_to: '2026-05-12',
    } as any);

    const p = captureUrl();
    expect(p.getAll('order[]')).toEqual(['-clicks', 'country']);
  });

  it('does NOT serialize sub9..sub30 as filter even if provided', async () => {
    await getAffiseCustomStats(CFG, {
      slice: ['day'],
      date_from: '2026-04-01',
      date_to: '2026-05-12',
      sub15: ['ignored'],   // not in arrayFilters list
      sub30: ['ignored'],
    } as any);

    const p = captureUrl();
    expect(p.getAll('filter[sub15][]')).toEqual([]);
    expect(p.getAll('filter[sub30][]')).toEqual([]);
  });
});

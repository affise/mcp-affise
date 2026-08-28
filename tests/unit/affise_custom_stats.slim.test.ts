/**
 * Tests for per-row slice-entity slimming in getAffiseCustomStats:
 *  - `offer` entity drops heavy non-analytical fields (url, logo), keeps
 *    id/title/offer_id/status.
 *  - `affiliate` entity is reduced to {id, login}.
 * Both run before compactTabular(), so the assertions are on the flattened
 * `columns` list.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getAffiseCustomStats } from '../../src/tools/affise_custom_stats.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function okWith(stats: any[]) {
  return {
    status: 200,
    statusText: 'OK',
    headers: {},
    config: {} as any,
    data: { stats, pagination: { count: stats.length, pages: 1 } },
  } as any;
}

describe('getAffiseCustomStats — slice entity slimming', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('offer slice: drops url + logo, keeps id/title/offer_id/status', async () => {
    (mockedAxios.get as Mock).mockResolvedValue(
      okWith([
        {
          slice: {
            offer: {
              id: 1,
              title: 'Test Offer',
              offer_id: 100,
              url: 'https://track.example.com/click',
              logo: 'https://cdn.example.com/logo.png',
              status: 'active',
            },
            sub2: 'abc',
          },
          actions: { total: { count: 5, charge: 50 } },
        },
      ]) as never,
    );

    const res = await getAffiseCustomStats(CFG, {
      slice: ['offer', 'sub2'],
      fields: ['conversions'],
      date_from: '2026-07-01',
      date_to: '2026-07-07',
    } as any);

    const columns: string[] = (res.data as any).columns;
    expect(columns).not.toContain('slice.offer.url');
    expect(columns).not.toContain('slice.offer.logo');
    expect(columns).toContain('slice.offer.id');
    expect(columns).toContain('slice.offer.title');
    expect(columns).toContain('slice.offer.offer_id');
    expect(columns).toContain('slice.offer.status');
    expect(columns).toContain('slice.sub2');
  });

  it('affiliate slice: reduced to {id, login}', async () => {
    (mockedAxios.get as Mock).mockResolvedValue(
      okWith([
        {
          slice: {
            affiliate: { id: 42, title: 'aff', login: 'aff', name: 'aff', email: 'a@b.c' },
          },
          actions: { total: { count: 3, charge: 30 } },
        },
      ]) as never,
    );

    const res = await getAffiseCustomStats(CFG, {
      slice: ['affiliate'],
      fields: ['conversions'],
      date_from: '2026-07-01',
      date_to: '2026-07-07',
    } as any);

    const columns: string[] = (res.data as any).columns;
    expect(columns).toContain('slice.affiliate.id');
    expect(columns).toContain('slice.affiliate.login');
    expect(columns).not.toContain('slice.affiliate.email');
    expect(columns).not.toContain('slice.affiliate.name');
    expect(columns).not.toContain('slice.affiliate.title');
  });
});

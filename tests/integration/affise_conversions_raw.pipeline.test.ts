/**
 * Integration: affise_conversions_raw through EnhancedToolHandler with mocked
 * axios. Exercises validation → handler → getAffiseConversions URL build.
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
    data: { conversions: [], pagination: { count: 0, pages: 0 } },
  } as any;
}

function captureUrl(): URLSearchParams {
  const call = (mockedAxios.get as Mock).mock.calls[0];
  const url = call[0] as string;
  const qs = url.split('?')[1] || '';
  return new URLSearchParams(qs);
}

describe('affise_conversions_raw — full pipeline', () => {
  let handler: EnhancedToolHandler;

  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(emptyOk() as never);
    handler = new EnhancedToolHandler(CFG);
  });

  it('golden case: nested filter is flattened, status names map to codes', async () => {
    const result = await handler.executeTool('affise_conversions_raw', {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      status: ['confirmed'],
      filter: {
        partner: ['193'],
        country: ['US'],
        sub5: ['promo-A'],
      },
      limit: 500,
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.get('date_from')).toBe('2026-04-01');
    expect(p.get('date_to')).toBe('2026-04-30');
    expect(p.getAll('status[]')).toEqual(['1']); // confirmed = 1
    expect(p.getAll('partner[]')).toEqual(['193']);
    expect(p.getAll('country[]')).toEqual(['US']);
    expect(p.getAll('sub5[]')).toEqual(['promo-A']);
    expect(p.get('limit')).toBe('500');
  });

  it('legacy affiliate alias is rewritten to partner', async () => {
    const result = await handler.executeTool('affise_conversions_raw', {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      affiliate: ['193'],
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('partner[]')).toEqual(['193']);
    expect(p.getAll('affiliate[]')).toEqual([]);
  });

  it('legacy affiliate inside filter is rewritten to partner', async () => {
    const result = await handler.executeTool('affise_conversions_raw', {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
      filter: { affiliate: ['193'] },
    });

    expect(result.status).toBe('ok');
    const p = captureUrl();
    expect(p.getAll('partner[]')).toEqual(['193']);
  });

  it('returns metadata.total_records / raw_export flag', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 200, statusText: 'OK', headers: {}, config: {},
      data: { conversions: [{ id: 1 }, { id: 2 }, { id: 3 }], pagination: { count: 3, pages: 1 } },
    } as never);

    const result = await handler.executeTool('affise_conversions_raw', {
      date_from: '2026-04-01',
      date_to: '2026-05-15',
      raw_export: 1,
    });

    expect(result.status).toBe('ok');
    expect(result.metadata.total_records).toBe(3);
    expect(result.metadata.raw_export).toBe(true);
    expect(result.metadata.filters_applied).toContain('raw_export');
  });

  it('rejects calls missing required date_from/date_to', async () => {
    const result = await handler.executeTool('affise_conversions_raw', {
      date_from: '',
      date_to: '',
    });
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('CONFIG_MISSING when no creds available', async () => {
    const noCfg = new EnhancedToolHandler(null);
    const result = await noCfg.executeTool('affise_conversions_raw', {
      date_from: '2026-04-01',
      date_to: '2026-04-30',
    });
    expect(result.status).toBe('error');
    expect(result.error?.code).toBe('CONFIG_MISSING');
  });
});

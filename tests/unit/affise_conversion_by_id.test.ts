/**
 * Unit tests for getConversionById — wraps GET /3.0/stats/conversionsbyid.
 */

import axios from 'axios';
import { vi, Mock, Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getConversionById } from '../../src/tools/affise_conversion_by_id.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };
const MONGO_ID = '507f1f77bcf86cd799439011';

// Go API wraps the response: { status, conversion: {...}, statusCode }.
// Our tool unwraps to data.conversion — tests mirror the real envelope.
function okResponse(conversion: any = { id: MONGO_ID, action_id: 'act-1', status: 'confirmed' }) {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, conversion, statusCode: 200 },
  } as any;
}

describe('getConversionById — request', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('GETs /3.0/stats/conversionsbyid with id query param', async () => {
    await getConversionById(CFG, { id: MONGO_ID });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(String(url)).toContain('/3.0/stats/conversionsbyid?');
    expect(new URLSearchParams(String(url).split('?')[1]).get('id')).toBe(MONGO_ID);
  });

  it('passes timezone when provided', async () => {
    await getConversionById(CFG, { id: MONGO_ID, timezone: 'UTC' });
    const [url] = (mockedAxios.get as Mock).mock.calls[0];
    expect(new URLSearchParams(String(url).split('?')[1]).get('timezone')).toBe('UTC');
  });

  it('returns ok with unwrapped conversion in data.conversion', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce(
      okResponse({ id: MONGO_ID, action_id: 'a', country: 'US', custom_field_1: 'x' }) as never,
    );
    const r = await getConversionById(CFG, { id: MONGO_ID });
    expect(r.status).toBe('ok');
    expect(r.data?.conversion?.id).toBe(MONGO_ID);
    expect(r.data?.conversion?.country).toBe('US');
    expect(r.data?.conversion?.custom_field_1).toBe('x');
  });
});

describe('getConversionById — guards', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('rejects non-MongoId', async () => {
    for (const bad of ['', '123', 'abc', '!'.repeat(24), '507f1f77bcf86cd79943901']) {
      const r = await getConversionById(CFG, { id: bad as any });
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/MongoId/);
    }
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });
});

describe('getConversionById — error mapping', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
  });

  it('404 → forwards "not found" message', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 404, statusText: 'Not Found', headers: {}, config: {} as any,
      data: { error: 'Conversion not found' },
    } as never);
    const r = await getConversionById(CFG, { id: MONGO_ID });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Conversion not found');
  });

  it('403 → GDPR / access denied', async () => {
    (mockedAxios.get as Mock).mockResolvedValueOnce({
      status: 403, statusText: 'Forbidden', headers: {}, config: {} as any,
      data: { error: 'Access denied' },
    } as never);
    const r = await getConversionById(CFG, { id: MONGO_ID });
    expect(r.status).toBe('error');
    expect(r.message).toBe('Access denied');
  });
});

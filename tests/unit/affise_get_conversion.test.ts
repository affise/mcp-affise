/**
 * Unit tests for getConversionById — wraps GET /3.0/stats/conversionsbyid.
 *
 * Pins the wire contract: id is a 24-char hex MongoId passed as a
 * QUERY PARAM, not a path segment (the /conversions/{id} alt form is
 * intentionally NOT used — see header comment in the impl).
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { getConversionById } from '../../src/tools/affise_conversion_by_id.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'admin-key' };
// Real MongoId shape (24 hex chars) — the impl validates this with regex
// BEFORE hitting axios, so we have to supply a passable value.
const VALID_ID = '648f8a2db49d2d0011aa00ff';

function okResponse() {
  return {
    status: 200, statusText: 'OK', headers: {}, config: {} as any,
    data: { status: 1, conversion: { id: VALID_ID, country: 'US' } },
  } as any;
}

function captureUrl(): { path: string; qs: URLSearchParams } {
  const [url] = (mockedAxios.get as Mock).mock.calls[0];
  const [path, qs] = String(url).split('?');
  return { path, qs: new URLSearchParams(qs || '') };
}

describe('getConversionById', () => {
  beforeEach(() => {
    (mockedAxios.get as Mock).mockReset();
    (mockedAxios.get as Mock).mockResolvedValue(okResponse() as never);
  });

  it('uses the query-param form (?id=...) — NOT the /conversions/{id} alt', async () => {
    await getConversionById(CFG, { id: VALID_ID });
    const { path, qs } = captureUrl();
    expect(path).toBe('https://api.example.com/3.0/stats/conversionsbyid');
    expect(qs.get('id')).toBe(VALID_ID);
    expect(path).not.toMatch(/\/conversions\/[0-9a-f]+$/);
  });

  it('forwards optional timezone', async () => {
    await getConversionById(CFG, { id: VALID_ID, timezone: 'Europe/Berlin' });
    const { qs } = captureUrl();
    expect(qs.get('timezone')).toBe('Europe/Berlin');
  });

  it('returns ok status with the conversion payload', async () => {
    const r = await getConversionById(CFG, { id: VALID_ID });
    expect(r.status).toBe('ok');
  });

  it('returns error envelope when baseUrl or apiKey missing', async () => {
    const r = await getConversionById({ baseUrl: '', apiKey: '' }, { id: VALID_ID });
    expect(r.status).toBe('error');
  });

  it('rejects non-MongoId ids at validation time (no axios call)', async () => {
    const r = await getConversionById(CFG, { id: 'abc123' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/MongoId|24-character/);
    expect((mockedAxios.get as Mock).mock.calls.length).toBe(0);
  });

  it('sets api-key header on the axios call', async () => {
    await getConversionById(CFG, { id: VALID_ID });
    const [, opts] = (mockedAxios.get as Mock).mock.calls[0];
    expect(opts.headers['api-key']).toBe('admin-key');
  });
});

/**
 * Unit tests for `createAffiseStatusTool` — the internal Affise reachability
 * probe. It hits `OPTIONS {baseUrl}/healthz` with an api-key header and maps
 * every known transport failure (`ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` /
 * HTTP error response) onto a structured error envelope.
 *
 * No longer an MCP tool: the model-facing `affise_status` was dropped because
 * an OPTIONS probe against an unauthenticated liveness path answers the same
 * way for a valid and an invalid API key. The probe stayed because
 * `performHealthCheck()` is built on it, and because the unconfigured stdio
 * surface still offers a setup-instructions tool under that name.
 *
 * Filled in 2026-05-25 as part of the Phase 1 follow-up that closed the
 * 3 missing-test gaps surfaced by the tool-contract reviewer.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { createAffiseStatusTool } from '../../src/tools/affise_status.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

describe('createAffiseStatusTool — probe layer', () => {
  beforeEach(() => {
    (mockedAxios.options as Mock).mockReset();
  });

  it('OPTIONS {baseUrl}/healthz with api-key header', async () => {
    (mockedAxios.options as Mock).mockResolvedValueOnce({ status: 204 } as never);

    await createAffiseStatusTool(CFG);

    const calls = (mockedAxios.options as Mock).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('https://api.example.com/healthz');
    expect(calls[0][1]?.headers?.['api-key']).toBe('test-key');
  });

  it('returns ok envelope on a successful probe', async () => {
    (mockedAxios.options as Mock).mockResolvedValueOnce({ status: 204 } as never);

    const r = await createAffiseStatusTool(CFG);

    expect(r.status).toBe('ok');
    expect(r.message).toContain('successful');
    expect(r.timestamp).toBeTruthy();
  });

  it('rejects missing baseUrl / apiKey BEFORE hitting axios', async () => {
    const r = await createAffiseStatusTool({ baseUrl: '', apiKey: '' });

    expect(r.status).toBe('error');
    expect(r.message).toMatch(/not provided/i);
    expect((mockedAxios.options as Mock).mock.calls).toHaveLength(0);
  });

  it('maps ECONNREFUSED → "refused the connection" message', async () => {
    const err: any = new Error('connect refused');
    err.code = 'ECONNREFUSED';
    (mockedAxios.options as Mock).mockRejectedValueOnce(err as never);

    const r = await createAffiseStatusTool(CFG);
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/refused the connection/i);
  });

  it('maps ETIMEDOUT → "did not respond" message', async () => {
    const err: any = new Error('took too long');
    err.code = 'ETIMEDOUT';
    (mockedAxios.options as Mock).mockRejectedValueOnce(err as never);

    const r = await createAffiseStatusTool(CFG);
    expect(r.message).toMatch(/did not respond/i);
  });

  it('maps ENOTFOUND → friendly URL-not-found message', async () => {
    const err: any = new Error('not found');
    err.code = 'ENOTFOUND';
    (mockedAxios.options as Mock).mockRejectedValueOnce(err as never);

    const r = await createAffiseStatusTool(CFG);
    // The plain-English copy includes 'URL not found' + an actionable
    // hint about typos. We pin the load-bearing fragment so the test
    // documents the contract without locking in every word of the prose.
    expect(r.message).toMatch(/url not found/i);
    expect(r.message).toMatch(/typo/i);
  });

  it('extracts HTTP status + body message when the API answered with an error', async () => {
    const err: any = new Error('AxiosError');
    err.response = { status: 503, data: { message: 'Service unavailable' } };
    (mockedAxios.options as Mock).mockRejectedValueOnce(err as never);

    const r = await createAffiseStatusTool(CFG);
    expect(r.status).toBe('error');
    expect(r.statusCode).toBe(503);
    expect(r.message).toContain('Service unavailable');
  });
});

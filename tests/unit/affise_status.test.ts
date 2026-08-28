/**
 * Unit tests for `affise_status`.
 *
 * Two layers under test:
 *  1. `createAffiseStatusTool` — the underlying probe that hits
 *     `OPTIONS {baseUrl}/healthz` with an api-key header and maps every
 *     known transport failure (`ECONNREFUSED` / `ETIMEDOUT` / `ENOTFOUND` /
 *     HTTP error response) onto a structured error envelope.
 *  2. `handleStatus` — the tool dispatcher entry, asserts config guards
 *     (`config: null` returns a config-missing error without ever calling
 *     axios) and the success/error mapping wraps the probe payload.
 *
 * Filled in 2026-05-25 as part of the Phase 1 follow-up that closed the
 * 3 missing-test gaps surfaced by the tool-contract reviewer.
 */

import axios from 'axios';
import { describe, it, expect, beforeEach, vi, type Mock, type Mocked } from 'vitest';

vi.mock('axios');
const mockedAxios = axios as Mocked<typeof axios>;

import { createAffiseStatusTool } from '../../src/tools/affise_status.js';
import { handleStatus } from '../../src/handlers/tools/nl.js';
import { ErrorHandlerService } from '../../src/services/error-handler-service.js';
import { ValidationService } from '../../src/services/validation-service.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function deps() {
  return {
    errorHandler: new ErrorHandlerService(),
    validator: new ValidationService(),
  };
}

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

describe('handleStatus — tool dispatcher entry', () => {
  beforeEach(() => {
    (mockedAxios.options as Mock).mockReset();
  });

  it('returns config-missing error when config is null (no axios call)', async () => {
    const r = await handleStatus({}, null, deps());

    expect(r.status).toBe('error');
    expect(r.message).toMatch(/no configuration/i);
    expect((mockedAxios.options as Mock).mock.calls).toHaveLength(0);
  });

  it('wraps a successful probe in {status, message, data: {...probe payload}, timestamp}', async () => {
    (mockedAxios.options as Mock).mockResolvedValueOnce({ status: 204 } as never);

    const r = await handleStatus({}, CFG, deps());

    expect(r.status).toBe('ok');
    expect(r.message).toContain('successful');
    expect(r.data?.status).toBe('ok');
    expect(r.data?.timestamp).toBeTruthy();
    expect(r.timestamp).toBeTruthy();
  });

  it('forwards probe error envelope verbatim (status=error, data has the failure detail)', async () => {
    const err: any = new Error('boom');
    err.code = 'ECONNREFUSED';
    (mockedAxios.options as Mock).mockRejectedValueOnce(err as never);

    const r = await handleStatus({}, CFG, deps());

    expect(r.status).toBe('error');
    // Probe builds its own message; the dispatcher passes both through.
    expect(r.data?.message).toMatch(/refused the connection/i);
  });
});

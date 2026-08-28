/**
 * Unit tests for the `affise_search_offers` HANDLER layer (handleOfferSearch).
 *
 * The handler is the dispatch entry the McpServer tool callback hits: it
 * guards config, runs the validator, calls `searchWithNaturalLanguage`,
 * and maps the unified-search result onto the `OfferSearchResponse` shape.
 *
 * Coverage focus is on the HANDLER's contract — not the underlying
 * search engine, which is exercised at the axios layer by
 * `affise_smart_search.test.ts`. We mock `searchWithNaturalLanguage`
 * directly so each test isolates one branch.
 *
 * Filled 2026-05-25 as part of the Phase 1 follow-up that closed the
 * 3 missing-test gaps the tool-contract reviewer surfaced.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock the underlying search engine BEFORE importing the handler module so
// the handler picks up the mocked binding.
vi.mock('../../src/tools/unified_affise_offers.js', async () => {
  const actual = await vi.importActual<any>('../../src/tools/unified_affise_offers.js');
  return {
    ...actual,
    searchWithNaturalLanguage: vi.fn(),
  };
});

import * as unified from '../../src/tools/unified_affise_offers.js';
import { handleOfferSearch } from '../../src/handlers/tools/nl.js';
import { ErrorHandlerService } from '../../src/services/error-handler-service.js';
import { ValidationService } from '../../src/services/validation-service.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'test-key' };

function deps() {
  return {
    errorHandler: new ErrorHandlerService(),
    validator: new ValidationService(),
  };
}

const mockSearch = unified.searchWithNaturalLanguage as unknown as Mock;

describe('handleOfferSearch — config + validation guards', () => {
  beforeEach(() => mockSearch.mockReset());

  it('returns CONFIG_MISSING when config is null (no engine call)', async () => {
    const r = await handleOfferSearch({ query: 'crypto' }, null, deps());
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('CONFIG_MISSING');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns CONFIG_MISSING when apiKey is empty (no engine call)', async () => {
    const r = await handleOfferSearch({ query: 'crypto' }, { baseUrl: 'x', apiKey: '' }, deps());
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('CONFIG_MISSING');
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('returns VALIDATION_ERROR for an empty query (no engine call)', async () => {
    const r = await handleOfferSearch({ query: '' }, CFG, deps());
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('VALIDATION_ERROR');
    expect(mockSearch).not.toHaveBeenCalled();
  });
});

describe('handleOfferSearch — success path', () => {
  beforeEach(() => mockSearch.mockReset());

  it('forwards the (sanitized) NL query into searchWithNaturalLanguage with explore intent', async () => {
    mockSearch.mockResolvedValueOnce({
      status: 'ok',
      message: 'Found 2',
      data: [{ id: 1 }, { id: 2 }],
      totalItems: 2,
      canContinue: false,
    });

    await handleOfferSearch({ query: 'high-converting crypto offers' }, CFG, deps());

    expect(mockSearch).toHaveBeenCalledTimes(1);
    const [cfgArg, queryArg, optsArg] = mockSearch.mock.calls[0];
    expect(cfgArg).toEqual(CFG);
    expect(queryArg).toBe('high-converting crypto offers');
    expect(optsArg).toEqual({ userIntent: 'explore', maxSampleSize: 50 });
  });

  it('maps engine ok-result to OfferSearchResponse with offers + total_found + has_more_results', async () => {
    mockSearch.mockResolvedValueOnce({
      status: 'ok',
      message: 'Found 3',
      data: [{ id: 1 }, { id: 2 }, { id: 3 }],
      totalItems: 17,
      canContinue: true,
      query_parsed: { categories: ['Finance'] },
      search_type: 'nl',
      insights: { summary: { total: 3 } } as any,
      recommendations: ['Try filter by country'],
    });

    const r = await handleOfferSearch({ query: 'finance' }, CFG, deps());

    expect(r.status).toBe('ok');
    expect(r.offers).toHaveLength(3);
    expect(r.total_found).toBe(17);
    expect(r.has_more_results).toBe(true);
    expect(r.query_parsed).toEqual({ categories: ['Finance'] });
    expect(r.search_type).toBe('nl');
    expect(r.insights?.summary?.total).toBe(3);
    expect(r.recommendations).toEqual(['Try filter by country']);
    expect(r.timestamp).toBeTruthy();
  });

  it('defaults total_found to 0 and has_more_results to false when engine omits them', async () => {
    mockSearch.mockResolvedValueOnce({ status: 'ok' });
    const r = await handleOfferSearch({ query: 'minimal' }, CFG, deps());
    expect(r.total_found).toBe(0);
    expect(r.has_more_results).toBe(false);
    expect(r.offers).toEqual([]);
  });
});

describe('handleOfferSearch — error mapping', () => {
  beforeEach(() => mockSearch.mockReset());

  it('wraps an engine status=error result as SEARCH_ERROR', async () => {
    mockSearch.mockResolvedValueOnce({
      status: 'error',
      message: 'Affise API timed out',
    });
    const r = await handleOfferSearch({ query: 'whatever' }, CFG, deps());
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('SEARCH_ERROR');
  });

  it('wraps a thrown engine exception as SEARCH_ERROR', async () => {
    mockSearch.mockRejectedValueOnce(new Error('boom'));
    const r = await handleOfferSearch({ query: 'whatever' }, CFG, deps());
    expect(r.status).toBe('error');
    expect(r.error?.code).toBe('SEARCH_ERROR');
    // ErrorHandlerService.sanitizeErrorMessage rewrites the message into a
    // generic user-facing string ("Search operation failed.") — we don't
    // pin the exact wording, just that the status + code flag is set.
    expect(r.error?.retryable).toBeDefined();
  });
});

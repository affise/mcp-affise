/**
 * Unit tests for getAffiseCustomStats() preflight guards — verifying that
 * known incompatible param combinations are rejected with a clear message
 * BEFORE the HTTP call (cleaner UX for LLM callers than the upstream 400).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('axios', () => {
  const fail = vi.fn(() => {
    throw new Error('Should not reach HTTP call — preflight guard must short-circuit');
  });
  return { default: { get: fail, post: fail } };
});

import { getAffiseCustomStats } from '../../src/tools/affise_custom_stats.js';

const CFG = { baseUrl: 'https://api.example.com', apiKey: 'k' };
const DATES = { date_from: '2026-05-01', date_to: '2026-05-07' };

describe('getAffiseCustomStats preflight guards', () => {
  describe('trafficback_reason slice', () => {
    it('rejects when fields is missing trafficback', async () => {
      const r = await getAffiseCustomStats(CFG, {
        slice: ['trafficback_reason'],
        ...DATES,
        fields: ['clicks', 'conversions'],
      } as any);
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/trafficback_reason.*only compatible with fields=\['trafficback'\]/);
    });

    it('rejects when fields contains trafficback PLUS other metrics', async () => {
      const r = await getAffiseCustomStats(CFG, {
        slice: ['trafficback_reason'],
        ...DATES,
        fields: ['trafficback', 'clicks'],
      } as any);
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/only compatible with fields=\['trafficback'\]/);
    });

    it('rejects when fields is empty', async () => {
      const r = await getAffiseCustomStats(CFG, {
        slice: ['trafficback_reason'],
        ...DATES,
        fields: [],
      } as any);
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/only compatible with fields=\['trafficback'\]/);
    });

    it('rejects when fields is undefined', async () => {
      const r = await getAffiseCustomStats(CFG, {
        slice: ['trafficback_reason'],
        ...DATES,
      } as any);
      expect(r.status).toBe('error');
      expect(r.message).toMatch(/only compatible with fields=\['trafficback'\]/);
    });

    it('does NOT trigger when slice has no trafficback_reason', async () => {
      // Should fall through to HTTP — our mocked axios throws, so we expect
      // a different error path than the trafficback guard message.
      const r = await getAffiseCustomStats(CFG, {
        slice: ['country'],
        ...DATES,
        fields: ['clicks'],
      } as any);
      expect(r.message ?? '').not.toMatch(/trafficback_reason.*only compatible/);
    });
  });
});

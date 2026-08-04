/**
 * Regression tests for the cache-key serializer.
 *
 * The original implementation was
 *   JSON.stringify(args, Object.keys(args || {}).sort())
 * where the second argument is a property ALLOWLIST applied at every nesting
 * level, not a sort. Nested `filter.*` keys were absent from the top-level key
 * list, so `filter` serialized as `{}` and two stats queries differing only by
 * partner / sub / goal / country shared one cache key — the second query got
 * the first query's rows for the whole TTL.
 */

import { describe, it, expect } from 'vitest';
import { stableStringify } from '../../src/handlers/enhanced-tools.js';

const statsArgs = (filter: Record<string, unknown>) => ({
  date_from: '2026-07-28',
  date_to: '2026-07-28',
  slice: ['sub2'],
  fields: ['clicks', 'conversions'],
  limit: 500,
  filter,
});

describe('stableStringify — nested filter identity', () => {
  it('distinguishes queries that differ only by filter.partner', () => {
    const a = stableStringify(statsArgs({ partner: ['325'] }));
    const b = stableStringify(statsArgs({ partner: ['999'] }));
    expect(a).not.toBe(b);
  });

  it('distinguishes queries that differ only by a nested sub filter', () => {
    const a = stableStringify(statsArgs({ partner: ['325'], sub2: ['alpha'] }));
    const b = stableStringify(statsArgs({ partner: ['325'], sub2: ['beta'] }));
    expect(a).not.toBe(b);
  });

  it('keeps nested filter values in the serialized form', () => {
    expect(stableStringify(statsArgs({ partner: ['325'], goal: ['reg_35'] })))
      .toContain('"partner":["325"]');
  });

  it('distinguishes an empty filter from a populated one', () => {
    expect(stableStringify(statsArgs({}))).not.toBe(stableStringify(statsArgs({ partner: ['325'] })));
  });
});

describe('stableStringify — determinism', () => {
  it('is insensitive to key order at every level', () => {
    const a = stableStringify({ b: 1, a: { y: 2, x: { n: 1, m: 2 } } });
    const b = stableStringify({ a: { x: { m: 2, n: 1 }, y: 2 }, b: 1 });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    expect(stableStringify({ slice: ['day', 'sub2'] })).not.toBe(stableStringify({ slice: ['sub2', 'day'] }));
  });

  it('handles null, undefined and primitives without throwing', () => {
    expect(stableStringify(undefined)).toBe('null');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
    expect(stableStringify(['a', 1, true, null])).toBe('["a",1,true,null]');
  });
});

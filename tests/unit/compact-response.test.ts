/**
 * Tests for compactTabular — variant B (drop empty cols + report dropped_columns).
 */

import { compactTabular } from '../../src/utils/compact-response.js';

describe('compactTabular — recognized response shapes', () => {
  it('detects rows under `stats` key', () => {
    const out = compactTabular({ stats: [{ a: 1, b: 2 }, { a: 3, b: 4 }] });
    expect(out.columns).toEqual(['a', 'b']);
    expect(out.rows).toEqual([[1, 2], [3, 4]]);
  });

  it('detects rows under `conversions` key', () => {
    const out = compactTabular({ conversions: [{ id: 1, ip: '1.1.1.1' }] });
    expect(out.columns).toEqual(['id', 'ip']);
    expect(out.rows).toEqual([[1, '1.1.1.1']]);
  });

  it('detects rows under `data` key', () => {
    const out = compactTabular({ data: [{ x: 'a' }] });
    expect(out.columns).toEqual(['x']);
    expect(out.rows).toEqual([['a']]);
  });

  it('detects bare array at top level', () => {
    const out = compactTabular([{ x: 'a' }, { x: 'b' }]);
    expect(out.columns).toEqual(['x']);
    expect(out.rows).toEqual([['a'], ['b']]);
  });

  it('passes through non-tabular responses unchanged', () => {
    const input = { message: 'ok', total: 5, something: { nested: true } };
    expect(compactTabular(input)).toBe(input);
  });

  it('returns empty tabular for empty stats array', () => {
    const out = compactTabular({ stats: [], pagination: { count: 0, page: 1, per_page: 50 } });
    expect(out.columns).toEqual([]);
    expect(out.rows).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.page).toBe(1);
    expect(out.per_page).toBe(50);
  });
});

describe('compactTabular — flatten depth-2', () => {
  it('flattens nested object properties with dot-notation', () => {
    const out = compactTabular({
      stats: [{ slice: { day: 1, country: 'US' }, traffic: { raw: 100 } }],
    });
    expect(out.columns.sort()).toEqual(['slice.country', 'slice.day', 'traffic.raw']);
    expect(out.rows[0]).toEqual([1, 'US', 100]);
  });

  it('keeps arrays as-is (no flattening into indexed columns)', () => {
    const out = compactTabular({
      stats: [{ id: 1, tags: ['a', 'b'] }],
    });
    expect(out.columns.sort()).toEqual(['id', 'tags']);
    expect(out.rows[0][out.columns.indexOf('tags')]).toEqual(['a', 'b']);
  });

  it('stops nesting at depth 2 (deeper objects kept as primitives at depth 3+)', () => {
    const out = compactTabular({
      stats: [{ a: { b: { c: { d: 'deep' } } } }],
    });
    // 'a.b' is depth 2 — 'a.b.c' would be depth 3, so 'a.b' carries the object {c:{d:'deep'}}
    expect(out.columns).toContain('a.b.c');
  });
});

describe('compactTabular — variant B drop & report', () => {
  it('drops a column where every row is empty (0/null/"")', () => {
    const out = compactTabular({
      stats: [
        { country: 'US', clicks: 100, declined: 0 },
        { country: 'UK', clicks: 50,  declined: 0 },
        { country: 'DE', clicks: 75,  declined: null },
      ],
    });
    expect(out.columns.sort()).toEqual(['clicks', 'country']);
    expect(out.dropped_columns).toEqual(['declined']);
  });

  it('keeps a column when any row has a non-empty value (0 in other rows preserved)', () => {
    const out = compactTabular({
      stats: [
        { country: 'US', conversions: 5 },
        { country: 'UK', conversions: 0 },  // 0 is "empty" by isEmpty, but US has non-empty
      ],
    });
    expect([...out.columns].sort()).toEqual(['conversions', 'country']);
    const convIdx = out.columns.indexOf('conversions');  // index in actual (un-sorted) columns
    expect(out.rows.map((r: any[]) => r[convIdx])).toEqual([5, 0]);  // 0 preserved
    expect(out.dropped_columns).toBeUndefined();
  });

  it('reports every dropped column in dropped_columns', () => {
    const out = compactTabular({
      stats: [
        { kept: 1, drop1: 0, drop2: '', drop3: null, drop4: false, drop5: [] },
      ],
    });
    expect(out.columns).toEqual(['kept']);
    expect(out.dropped_columns?.sort()).toEqual(['drop1', 'drop2', 'drop3', 'drop4', 'drop5']);
  });

  it('omits dropped_columns key entirely when nothing dropped', () => {
    const out = compactTabular({ stats: [{ a: 1, b: 2 }] });
    expect(out.dropped_columns).toBeUndefined();
  });

  it('preserves user-visible values in rows', () => {
    const out = compactTabular({
      stats: [
        { name: 'Alice', score: 100 },
        { name: 'Bob',   score: 0 },     // score kept (Alice has non-zero)
        { name: '',      score: 50 },    // name='' kept (Alice/Bob have values)
      ],
    });
    expect(out.columns.sort()).toEqual(['name', 'score']);
    const nameIdx = out.columns.indexOf('name');
    expect(out.rows.map((r: any[]) => r[nameIdx])).toEqual(['Alice', 'Bob', '']);
  });
});

describe('compactTabular — pagination', () => {
  it('forwards pagination.count → total', () => {
    const out = compactTabular({
      stats: [{ a: 1 }],
      pagination: { count: 42, page: 2, per_page: 10 },
    });
    expect(out.total).toBe(42);
    expect(out.page).toBe(2);
    expect(out.per_page).toBe(10);
  });

  it('prefers pagination.total_count over count', () => {
    const out = compactTabular({
      stats: [{ a: 1 }],
      pagination: { total_count: 99, count: 5, page: 1, per_page: 5 },
    });
    expect(out.total).toBe(99);
  });

  it('omits pagination keys when not provided', () => {
    const out = compactTabular({ stats: [{ a: 1 }] });
    expect(out.total).toBeUndefined();
    expect(out.page).toBeUndefined();
    expect(out.per_page).toBeUndefined();
  });
});

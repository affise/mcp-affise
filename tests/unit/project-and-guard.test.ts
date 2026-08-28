import { describe, it, expect } from 'vitest';
import { projectGridColumns } from '../../src/utils/compact-response.js';
import { enforceResultSizeLimit } from '../../src/handlers/enhanced-tools.js';

describe('projectGridColumns', () => {
  const grid = {
    columns: ['id', 'status', 'offer.id', 'offer.title', 'partner.login', 'payouts'],
    rows: [
      [1, 'confirmed', 983, 'Jolly', 'affsub2', 0.45],
      [2, 'pending', 984, 'Other', 'affsub3', 0.10],
    ],
    total: 2,
  };

  it('keeps only requested columns, in requested order', () => {
    const out = projectGridColumns(grid, 'partner.login,id,payouts');
    expect(out.columns).toEqual(['partner.login', 'id', 'payouts']);
    expect(out.rows).toEqual([['affsub2', 1, 0.45], ['affsub3', 2, 0.10]]);
  });

  it('ignores unknown / mistyped field names (e.g. payout vs payouts)', () => {
    const out = projectGridColumns(grid, 'id,payout,status'); // "payout" does not exist
    expect(out.columns).toEqual(['id', 'status']);
  });

  it('records the removed columns in dropped_columns', () => {
    const out = projectGridColumns(grid, 'id');
    expect(out.dropped_columns).toContain('status');
    expect(out.dropped_columns).toContain('offer.title');
  });

  it('returns the grid unchanged when no field matches (better full than empty)', () => {
    const out = projectGridColumns(grid, 'nope,alsono');
    expect(out.columns).toEqual(grid.columns);
  });

  it('returns the grid unchanged when no fields requested', () => {
    expect(projectGridColumns(grid, undefined)).toBe(grid);
    expect(projectGridColumns(grid, '')).toBe(grid);
  });
});

describe('enforceResultSizeLimit', () => {
  function bigGridResult(rows: number, cols: number) {
    const columns = Array.from({ length: cols }, (_, i) => `c${i}`);
    const row = Array.from({ length: cols }, () => 'x'.repeat(40));
    return {
      status: 'ok',
      data: { columns, rows: Array.from({ length: rows }, () => [...row]), total: rows },
    };
  }

  it('passes small results through untouched', () => {
    const r = bigGridResult(10, 5);
    const before = JSON.stringify(r);
    enforceResultSizeLimit(r, true);
    expect(JSON.stringify(r)).toBe(before);
  });

  it('truncates an oversized grid and annotates metadata.truncated', () => {
    const r = bigGridResult(20000, 20); // well over 800 KB
    const out = enforceResultSizeLimit(r, true);
    expect(out.data.rows.length).toBeLessThan(20000);
    expect(Buffer.byteLength(JSON.stringify(out), 'utf8')).toBeLessThanOrEqual(800_000);
    expect(out.metadata.truncated.total).toBe(20000);
    expect(out.metadata.truncated.returned).toBe(out.data.rows.length);
    expect(out.metadata.truncated.hint).toMatch(/fields|page/);
  });

  it('leaves results alone when there is no widget', () => {
    const r = bigGridResult(20000, 20);
    const before = r.data.rows.length;
    enforceResultSizeLimit(r, false);
    expect(r.data.rows.length).toBe(before);
  });
});

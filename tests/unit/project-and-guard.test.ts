import { describe, it, expect } from 'vitest';
import { projectGridColumns } from '../../src/utils/compact-response.js';

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

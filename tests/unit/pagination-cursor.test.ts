import { describe, it, expect } from 'vitest';
import { buildPaginationCursor } from '../../src/handlers/enhanced-tools.js';

function gridResult(rows: number, total: number, page = 1, per_page = 100) {
  return {
    status: 'ok',
    data: {
      columns: ['id', 'login'],
      rows: Array.from({ length: rows }, (_, i) => [i, `p${i}`]),
      total, page, per_page,
    },
  };
}

describe('buildPaginationCursor', () => {
  it('reports hasMore when the page does not cover the total', () => {
    const c = buildPaginationCursor('affise_list_partners', { status: 'active', limit: 100, page: 1 }, gridResult(100, 280));
    expect(c).toMatchObject({
      tool: 'affise_list_partners',
      args: { status: 'active', limit: 100, page: 1 },
      page: 1, perPage: 100, total: 280, returned: 100, hasMore: true,
    });
  });

  it('reports hasMore=false on the last page', () => {
    const c = buildPaginationCursor('affise_list_partners', { limit: 100, page: 3 }, gridResult(80, 280, 3));
    expect(c.hasMore).toBe(false);
    expect(c.page).toBe(3);
  });

  it('reports hasMore=false when one page covers the whole set', () => {
    const c = buildPaginationCursor('affise_conversions_raw', { limit: 100, page: 1 }, gridResult(42, 42));
    expect(c.hasMore).toBe(false);
    expect(c.total).toBe(42);
  });

  it('returns null when the result has no grid (error/empty)', () => {
    expect(buildPaginationCursor('affise_list_partners', {}, { status: 'error', message: 'boom' })).toBeNull();
  });

  it('carries the canonical args so the widget can replay filters on the next page', () => {
    const args = { status: 'active', manager: ['m1'], limit: 100, page: 1 };
    const c = buildPaginationCursor('affise_list_advertisers', args, gridResult(100, 500));
    expect(c.args).toEqual(args);
  });
});

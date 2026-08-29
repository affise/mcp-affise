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

  // Boundary: page * perPage === total exactly. Without this case a `<` vs `<=`
  // slip is invisible — the other cases compute 100-vs-280, 300-vs-280 and
  // 100-vs-42, none of which distinguish the two operators. Getting it wrong
  // hands the client a phantom empty extra page.
  it('reports hasMore=false when the last page lands exactly on the total', () => {
    const c = buildPaginationCursor('affise_list_partners', { limit: 100, page: 3 }, gridResult(100, 300, 3));
    expect(c.total).toBe(300);
    expect(c.page * c.perPage).toBe(c.total);
    expect(c.hasMore).toBe(false);
  });

  it('reports hasMore when one row spills past an exact page boundary', () => {
    const c = buildPaginationCursor('affise_list_partners', { limit: 100, page: 3 }, gridResult(100, 301, 3));
    expect(c.hasMore).toBe(true);
  });

  it('returns null when the result has no grid (error/empty)', () => {
    expect(buildPaginationCursor('affise_list_partners', {}, { status: 'error', message: 'boom' })).toBeNull();
  });

  it('carries the canonical args so a caller can replay filters on the next page', () => {
    const args = { status: 'active', manager: ['m1'], limit: 100, page: 1 };
    const c = buildPaginationCursor('affise_list_advertisers', args, gridResult(100, 500));
    expect(c.args).toEqual(args);
  });
});

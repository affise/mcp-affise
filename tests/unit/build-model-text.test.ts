import { describe, it, expect } from 'vitest';
import { buildModelText } from '../../src/handlers/enhanced-tools.js';

/** Build a compactTabular-style grid result with N rows wrapped under `.data`. */
function gridResult(n: number) {
  const columns = ['id', 'login', 'status', 'balance', 'manager.title'];
  const rows = Array.from({ length: n }, (_, i) => [
    1000 + i, `partner_${i}@example.com`, 'active', (i * 1.5).toFixed(2), 'Manager Name',
  ]);
  return {
    status: 'ok',
    message: `Retrieved ${n} partners`,
    data: { columns, rows, dropped_columns: ['notes', 'avatar'], total: n, page: 1, per_page: 500 },
    metadata: { total_count: n, page: 1, per_page: 500 },
    timestamp: '2026-06-04T00:00:00.000Z',
  };
}

describe('buildModelText', () => {
  it('passes a small payload through as full JSON', () => {
    const result = gridResult(2);
    const text = buildModelText(result, true);
    expect(JSON.parse(text)).toEqual(result); // unchanged
  });

  it('passes large payloads through unchanged when there is no structuredContent', () => {
    const result = gridResult(280);
    const text = buildModelText(result, false);
    // Without structuredContent the text block is the only copy of the data,
    // so collapsing it would lose rows outright.
    expect(JSON.parse(text)).toEqual(result);
  });

  it('collapses a large grid to a summary + sample when structuredContent carries the rows', () => {
    const result = gridResult(280);
    const parsed = JSON.parse(buildModelText(result, true));

    expect(parsed.status).toBe('ok');
    expect(parsed.summary.total).toBe(280);
    expect(parsed.summary.returned_rows).toBe(280);
    expect(parsed.summary.page).toBe(1);
    expect(parsed.summary.per_page).toBe(500);
    expect(parsed.summary.columns).toEqual(['id', 'login', 'status', 'balance', 'manager.title']);
    expect(parsed.summary.dropped_columns).toEqual(['notes', 'avatar']);
    // only a handful of sample rows, not all 280
    expect(parsed.sample_rows).toHaveLength(5);
    // The note must point the model at where the full rows actually are.
    // It used to say "rendered in the widget" — this package ships no widget,
    // so that sent the model re-querying with narrower filters for data it
    // had already been handed in structuredContent.
    expect(parsed.note).toContain('structuredContent');
    expect(parsed.note).not.toMatch(/widget/i);
    // full row set must NOT be inlined
    expect(parsed.data).toBeUndefined();
  });

  it('keeps the summary far smaller than the full payload', () => {
    const result = gridResult(280);
    const full = buildModelText(result, false);
    const summary = buildModelText(result, true);
    expect(Buffer.byteLength(summary)).toBeLessThan(Buffer.byteLength(full) / 5);
  });

  it('summarizes a large array collection (e.g. offers) when no grid is present', () => {
    const offers = Array.from({ length: 500 }, (_, i) => ({
      id: i, title: `Offer ${i}`, description: 'x'.repeat(80),
    }));
    const result = {
      status: 'ok',
      message: 'Found offers',
      data: { offers },
      timestamp: '2026-06-04T00:00:00.000Z',
    };
    const parsed = JSON.parse(buildModelText(result, true));
    expect(parsed.summary.collection).toBe('offers');
    expect(parsed.summary.returned).toBe(500);
    expect(parsed.sample_items).toHaveLength(3);
    expect(parsed.data).toBeUndefined();
  });
});

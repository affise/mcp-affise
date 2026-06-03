/**
 * Tests for simple-parser's extractFilters() and its integration into toStatsParams().
 * Covers key=value parsing, the legacy affiliate→partner alias, sub-key range,
 * and case-preservation for filter values.
 */

import { extractFilters, parseQuery, toStatsParams } from '../../src/types/simple-parser.js';

describe('extractFilters', () => {
  it('parses affiliate=193 as legacy alias for partner', () => {
    const f = extractFilters('affiliate=193');
    expect(f.partner).toEqual(['193']);
    expect(f.affiliate).toBeUndefined();
  });

  it('parses partner=193 directly', () => {
    const f = extractFilters('partner=193');
    expect(f.partner).toEqual(['193']);
  });

  it('preserves case in filter values (os=Unknown)', () => {
    const f = extractFilters('os=Unknown');
    expect(f.os).toEqual(['Unknown']);
  });

  it('parses comma-separated values', () => {
    const f = extractFilters('partner=193,194');
    expect(f.partner).toEqual(['193', '194']);
  });

  it('parses sub1..sub8 keys', () => {
    const f = extractFilters('sub1=abc sub8=xyz');
    expect(f.sub1).toEqual(['abc']);
    expect(f.sub8).toEqual(['xyz']);
  });

  it('ignores sub9..sub30 (Filter.php does not accept them as filter)', () => {
    const f = extractFilters('sub15=ignored sub30=ignored');
    expect(f.sub15).toBeUndefined();
    expect(f.sub30).toBeUndefined();
  });

  it('handles prose form "for affiliate 193" → partner', () => {
    const f = extractFilters('show stats for affiliate 193 last month');
    expect(f.partner).toEqual(['193']);
  });

  it('handles prose form "offer 12345"', () => {
    const f = extractFilters('revenue for offer 12345 last week');
    expect(f.offer).toEqual(['12345']);
  });

  it('supports key: value with colon separator', () => {
    const f = extractFilters('country: US');
    expect(f.country).toEqual(['US']);
  });
});

describe('toStatsParams integration', () => {
  it('attaches partner from affiliate=193 in the original query', () => {
    const parsed = parseQuery('Stats for affiliate=193 os=Unknown last week');
    const params = toStatsParams(parsed);
    expect(params.partner).toEqual(['193']);
    expect(params.os).toEqual(['Unknown']);
    expect(params.period).toBe('lastweek');
  });

  it('does not regress on the old "gaming offers in US for mobile" path', () => {
    const parsed = parseQuery('Show me gaming offers in US for mobile traffic last 7 days');
    const params = toStatsParams(parsed);
    expect(params.country).toEqual(['US']);
    expect(params.device).toEqual(['mobile']);
    expect(params.period).toBe('last7days');
  });

  it('combines filters with explicit dimensions from the query', () => {
    const parsed = parseQuery('Top 10 partners by clicks last month partner=193');
    const params = toStatsParams(parsed);
    expect(params.partner).toEqual(['193']);
    expect(params.slice).toContain('affiliate'); // "top 10 partners" → affiliate dimension
    expect(params.period).toBe('lastmonth');
  });
});

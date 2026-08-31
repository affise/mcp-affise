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

  it('extracts advertiser MongoId from prose "for advertiser <id>"', () => {
    const f = extractFilters('Performance by offer for advertiser 507f1f77bcf86cd799439011 last 30 days');
    expect(f.advertiser).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('extracts a single-token advertiser name from prose', () => {
    const f = extractFilters('revenue for advertiser Acme last week');
    expect(f.advertiser).toEqual(['Acme']);
  });

  it('extracts a quoted multi-word advertiser name without swallowing the time phrase', () => {
    const f = extractFilters('Performance by offer for advertiser "Acme Mobile" last 30 days');
    expect(f.advertiser).toEqual(['Acme Mobile']);
  });

  it('does not capture stopwords after "advertiser" as a name', () => {
    const f = extractFilters('show advertiser performance last month');
    expect(f.advertiser).toBeUndefined();
  });

  it('extracts supplier prose into the supplier key', () => {
    const f = extractFilters('stats for supplier 507f1f77bcf86cd799439011 last week');
    expect(f.supplier).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('still honours explicit advertiser: value form', () => {
    const f = extractFilters('advertiser: 507f1f77bcf86cd799439011');
    expect(f.advertiser).toEqual(['507f1f77bcf86cd799439011']);
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

describe('period-over-period comparison intent', () => {
  it('flags "this month vs last?" as a comparison with current=thismonth', () => {
    const parsed = parseQuery('How did the network do this month vs last?');
    expect(parsed.compare).toBe(true);
    expect(parsed.time_period).toBe('thismonth');
  });

  it('reads the current period from the LEFT of "vs" ("this month vs last month")', () => {
    const parsed = parseQuery('revenue this month vs last month');
    expect(parsed.compare).toBe(true);
    expect(parsed.time_period).toBe('thismonth'); // not lastmonth
  });

  it('infers thisweek from the WoW shorthand and keeps the partner filter', () => {
    const parsed = parseQuery('WoW for partner 193');
    expect(parsed.compare).toBe(true);
    expect(parsed.time_period).toBe('thisweek');
    const params = toStatsParams(parsed);
    expect(params.partner).toEqual(['193']);
  });

  it('handles "this week vs the week before"', () => {
    const parsed = parseQuery('clicks this week vs the week before');
    expect(parsed.compare).toBe(true);
    expect(parsed.time_period).toBe('thisweek');
  });

  it('handles "last month vs the month before" → current=lastmonth', () => {
    const parsed = parseQuery('network last month vs the month before');
    expect(parsed.compare).toBe(true);
    expect(parsed.time_period).toBe('lastmonth');
  });

  it('does not flag a plain single-period query', () => {
    const parsed = parseQuery('revenue last week');
    expect(parsed.compare).toBeFalsy();
  });
});

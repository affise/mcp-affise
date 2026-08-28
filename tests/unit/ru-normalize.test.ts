/**
 * Tests for the Russian → English normalization shim feeding the NL parser.
 * Assert both the normalized string (simple cases) and the end-to-end parse
 * (dimensions / filters / date ranges) for representative Russian phrasings.
 */

import { normalizeRuToEn } from '../../src/types/ru-normalize.js';
import { parseQuery, toStatsParams, extractExplicitDateRanges } from '../../src/types/simple-parser.js';

const YEAR = new Date().getUTCFullYear();

describe('normalizeRuToEn — passthrough & guards', () => {
  it('returns English input unchanged (no Cyrillic → fast path)', () => {
    const q = 'top 10 partners by clicks last week';
    expect(normalizeRuToEn(q)).toBe(q);
  });
});

describe('normalizeRuToEn — entity synonyms', () => {
  it('партнёр / аффилиат / вебмастер / паблишер → partner (numeric = filter)', () => {
    for (const word of ['партнёру', 'аффилиату', 'вебмастеру', 'паблишеру']) {
      const params = toStatsParams(parseQuery(normalizeRuToEn(`статистика по ${word} 325`)));
      expect(params.partner).toEqual(['325']);
    }
  });

  it('single-ф affiliate spellings (афилят / афилейт) → partner', () => {
    for (const word of ['афилят', 'афилейт', 'аффилейт']) {
      const params = toStatsParams(parseQuery(normalizeRuToEn(`статистика по ${word} 325`)));
      expect(params.partner).toEqual(['325']);
    }
  });

  it('advertiser spellings (адверт / эдверт / адвертайзер / саплаер) → advertiser', () => {
    for (const word of ['адверт', 'эдверт', 'адвертайзер', 'саплаеру']) {
      expect(normalizeRuToEn(`в разбивке по ${word}`)).toContain('advertiser');
    }
  });

  it('does NOT misfire on similar Cyrillic words (африка / афиша / адвокат)', () => {
    for (const word of ['африка', 'афиша', 'адвокат']) {
      const out = normalizeRuToEn(`страна ${word}`);
      expect(out).not.toContain('partner');
      expect(out).not.toContain('advertiser');
    }
  });

  it('number-before-entity order also yields a filter ("325 партнёру")', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn('325 партнёру статистика')));
    expect(params.partner).toEqual(['325']);
  });

  it('"в разбивке по рекламодателям" → advertiser slice', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn('статистика в разбивке по рекламодателям за эту неделю')));
    expect(params.slice).toContain('advertiser');
  });
});

describe('normalizeRuToEn — Russian dates', () => {
  it('"за июль 2026" → whole-month ISO range', () => {
    expect(extractExplicitDateRanges(normalizeRuToEn('выручка по стране за июль 2026')))
      .toEqual([{ date_from: '2026-07-01', date_to: '2026-07-31' }]);
  });

  it('"DD.MM.YYYY по DD.MM.YYYY" → ISO range', () => {
    expect(extractExplicitDateRanges(normalizeRuToEn('клики с 01.06.2026 по 15.06.2026')))
      .toEqual([{ date_from: '2026-06-01', date_to: '2026-06-15' }]);
  });

  it('"за прошлую неделю" → lastweek period', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn('статистика по партнёру 325 за прошлую неделю')));
    expect(params.period).toBe('lastweek');
    expect(params.partner).toEqual(['325']);
  });
});

describe('normalizeRuToEn — original client query (multi-range + partner + sub2)', () => {
  const RU = 'выгрузи статистику с 1 по 7 и с 8 по 14 июля ао 325 партнеру в разбивке по sub2';

  it('produces two July ranges', () => {
    expect(extractExplicitDateRanges(normalizeRuToEn(RU))).toEqual([
      { date_from: `${YEAR}-07-01`, date_to: `${YEAR}-07-07` },
      { date_from: `${YEAR}-07-08`, date_to: `${YEAR}-07-14` },
    ]);
  });

  it('slice=[sub2], filter partner=325, no spurious affiliate slice', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn(RU)));
    expect(params.slice).toEqual(['sub2']);
    expect(params.partner).toEqual(['325']);
  });
});

describe('normalizeRuToEn — Cyrillic sub + leading "по" partner (verbatim client ask)', () => {
  const RU = 'Выгрузи статистику по саб2 по 325 партнеру с 1 по 7 июля 2026';

  it('Cyrillic "саб2" → sub2 slice', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn(RU)));
    expect(params.slice).toEqual(['sub2']);
  });

  it('leading "по 325 партнеру" stays a partner filter (no affiliate slice)', () => {
    const params = toStatsParams(parseQuery(normalizeRuToEn(RU)));
    expect(params.partner).toEqual(['325']);
    expect(params.slice).not.toContain('affiliate');
  });

  it('single explicit July range', () => {
    expect(extractExplicitDateRanges(normalizeRuToEn(RU)))
      .toEqual([{ date_from: '2026-07-01', date_to: '2026-07-07' }]);
  });

  it('"суб" spelling and spaced form ("саб 5") also normalize', () => {
    for (const w of ['суб5', 'саб 5']) {
      const params = toStatsParams(parseQuery(normalizeRuToEn(`статистика по ${w} за июль 2026`)));
      expect(params.slice).toEqual(['sub5']);
    }
  });
});

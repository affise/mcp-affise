/**
 * Russian → English normalization shim for the NL stats parser.
 *
 * The core parser (`simple-parser.ts`) is English-only: its dictionaries are
 * English and its regexes use ASCII `\b`, which does NOT match Cyrillic. Rather
 * than duplicate every extractor in Russian, we normalize a Russian query into
 * the canonical English phrasing the existing engine already understands, then
 * let the untouched parser do the rest.
 *
 * Applied in `handleStatsNL` before `parseQuery` / `extractExplicitDateRanges`.
 * Non-Cyrillic queries are returned byte-for-byte unchanged (fast path → zero
 * risk for existing English queries).
 *
 * Scope is deliberately 80/20: frequent phrasings, entity synonyms, and Russian
 * date forms. Exotic morphology is left to the calling agent (which translates
 * anyway). See docs/NL_PARSER_GUIDE.md.
 */

const CYRILLIC = /[Ѐ-ӿ]/;

// Unicode-aware word boundaries (ASCII \b fails on Cyrillic).
const BL = '(?<![\\p{L}\\p{N}])';
const BR = '(?![\\p{L}\\p{N}])';
const rx = (body: string, flags = 'giu'): RegExp => new RegExp(`${BL}(?:${body})${BR}`, flags);

// Month stems (genitive/other cases via trailing \p{L}*). Ordered so longer /
// unambiguous stems match before short ones; `ма[йея]` last to avoid clashing
// with `март`.
const MONTHS: Array<[RegExp, number]> = [
  [rx('январ\\p{L}*'), 1], [rx('феврал\\p{L}*'), 2], [rx('март\\p{L}*'), 3],
  [rx('апрел\\p{L}*'), 4], [rx('июн\\p{L}*'), 6], [rx('июл\\p{L}*'), 7],
  [rx('август\\p{L}*'), 8], [rx('сентябр\\p{L}*'), 9], [rx('октябр\\p{L}*'), 10],
  [rx('ноябр\\p{L}*'), 11], [rx('декабр\\p{L}*'), 12], [rx('ма[йея]\\p{L}*'), 5],
];
const MONTH_ANY = /(январ|феврал|март|апрел|июн|июл|август|сентябр|октябр|ноябр|декабр|ма[йея])\p{L}*/giu;

// Entity synonym clusters (Russian, any case) → canonical English token.
const PARTNER_RU = 'партн[её]р\\p{L}*|афф?ил\\p{L}*|вебмастер\\p{L}*|паблишер\\p{L}*';
const ADVERTISER_RU = 'рекламодател\\p{L}*|[эа]дверт\\p{L}*|поставщик\\p{L}*|саплаер\\p{L}*';
const OFFER_RU = 'оффер\\p{L}*|офер\\p{L}*';

// Dimension words (already-English) that `по` may precede to form a slice.
const DIM =
  'country|city|offer|offers|partner|advertiser|affiliate|day|daily|month|hour|week|year|os|device|browser|goal|smart_id|smartlink|sub\\d+';

const pad2 = (n: number | string) => String(n).padStart(2, '0');
const lastDayOfMonth = (year: number, month1: number) =>
  new Date(Date.UTC(year, month1, 0)).getUTCDate();

function currentYear(): number {
  return new Date().getUTCFullYear();
}

/**
 * Normalize Russian date phrasings into ISO ranges the parser understands.
 * Handles: "за <month> [YYYY]" (whole month); "DD.MM.YYYY (по|-) DD.MM.YYYY";
 * "с D по D <month> [YYYY]" / "D-D <month>" with the month applying to each
 * preceding day-range (nearest month to the right, else the last month seen).
 */
function normalizeDates(input: string): string {
  let q = input;
  const yearMatch = q.match(/(?<!\d)(20\d{2})(?!\d)/);
  const defaultYear = yearMatch ? Number(yearMatch[1]) : currentYear();

  // "за июль [2026]" → whole month
  q = q.replace(
    new RegExp(`${BL}за\\s+(${MONTH_ANY.source})(?:\\s+(20\\d{2}))?`, 'giu'),
    (whole: string, monthWord: string, ...rest: any[]) => {
      const year = rest.find((r) => typeof r === 'string' && /^20\d{2}$/.test(r));
      const m = monthNumber(monthWord);
      if (!m) return whole;
      const y = year ? Number(year) : defaultYear;
      return `from ${y}-${pad2(m)}-01 to ${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`;
    },
  );

  // "DD.MM.YYYY (по|-|до) DD.MM.YYYY"
  q = q.replace(
    /(\d{1,2})\.(\d{1,2})\.(20\d{2})\s*(?:по|до|-|–|—|to)\s*(\d{1,2})\.(\d{1,2})\.(20\d{2})/gi,
    (_m, d1, m1, y1, d2, m2, y2) =>
      `from ${y1}-${pad2(m1)}-${pad2(d1)} to ${y2}-${pad2(m2)}-${pad2(d2)}`,
  );

  // "с D по D" / "D по D" / "D-D" day-ranges: attach the nearest month to the
  // right (fallback: last month in the string).
  const monthHits: Array<{ index: number; month: number }> = [];
  for (const mm of q.matchAll(MONTH_ANY)) {
    const m = monthNumber(mm[0]);
    if (m) monthHits.push({ index: mm.index ?? 0, month: m });
  }
  const lastMonth = monthHits.length ? monthHits[monthHits.length - 1].month : 0;

  if (lastMonth) {
    const dayRange = /(?<![\p{L}\p{N}.])с?\s*(\d{1,2})\s*(?:по|-|–|—)\s*(\d{1,2})(?![\p{L}\p{N}.])/giu;
    q = q.replace(dayRange, (whole, d1: string, d2: string, offset: number) => {
      const nn = Number(d1), mm = Number(d2);
      if (nn < 1 || nn > 31 || mm < 1 || mm > 31) return whole;
      const nearest = monthHits.find((h) => h.index > offset);
      const month = nearest ? nearest.month : lastMonth;
      return `from ${defaultYear}-${pad2(month)}-${pad2(d1)} to ${defaultYear}-${pad2(month)}-${pad2(d2)}`;
    });
    // strip the now-consumed month words
    q = q.replace(MONTH_ANY, ' ');
  }

  return q;
}

function monthNumber(word: string): number {
  for (const [re, num] of MONTHS) {
    re.lastIndex = 0;
    if (re.test(word)) return num;
  }
  return 0;
}

/**
 * Translate a Russian NL stats query into the canonical English phrasing the
 * core parser understands. Idempotent-ish and safe on English input (returned
 * unchanged when no Cyrillic is present).
 */
export function normalizeRuToEn(input: string): string {
  if (!CYRILLIC.test(input)) return input;

  let q = ` ${input.toLowerCase()} `;

  // conjunction (between multiple date ranges etc.)
  q = q.replace(/(?<![\p{L}])и(?![\p{L}])/gu, ' and ');

  // dates → ISO (consumes month words)
  q = normalizeDates(q);

  // Cyrillic sub transliteration ("саб2"/"суб 5" → "sub2"). Must run before the
  // "по <dim> → by" step so the sub-ID is recognized as a slice dimension.
  q = q.replace(rx('(?:саб|суб)\\s*(\\d+)'), 'sub$1');

  // entity + numeric id → filter prose ("partner 325"), both word orders and
  // with/without a leading "по"/"для". Done BEFORE the generic "по → by" step so
  // a numeric partner stays a FILTER, not an affiliate slice. BOTH orders must
  // consume the leading "по"/"для" — otherwise "по 325 партнеру" leaves a "по"
  // that the "по <dim>" step turns into "by partner", and the dimension-map
  // includes-check ("by partner") wrongly injects an affiliate slice.
  q = q.replace(rx(`(?:по\\s+|для\\s+)?(?:${PARTNER_RU})\\s+(\\d+)`), 'partner $1');
  q = q.replace(rx(`(?:по\\s+|для\\s+)?(\\d+)\\s+(?:${PARTNER_RU})`), 'partner $1');
  q = q.replace(rx(`(?:по\\s+|для\\s+)?(?:${OFFER_RU})\\s+(\\d+)`), 'offer $1');
  q = q.replace(rx(`(?:по\\s+|для\\s+)?(\\d+)\\s+(?:${OFFER_RU})`), 'offer $1');

  // remaining entity mentions (no id) → canonical English token
  q = q.replace(rx(PARTNER_RU), 'partner');
  q = q.replace(rx(ADVERTISER_RU), 'advertiser');
  q = q.replace(rx(OFFER_RU), 'offer');
  q = q.replace(rx('стран\\p{L}*'), 'country');
  q = q.replace(rx('город\\p{L}*'), 'city');
  q = q.replace(rx('доход\\p{L}*|выручк\\p{L}*'), 'revenue');
  q = q.replace(rx('клик\\p{L}*'), 'clicks');
  q = q.replace(rx('конверси\\p{L}*'), 'conversions');
  q = q.replace(rx('выплат\\p{L}*'), 'payouts');
  q = q.replace(rx('гоал\\p{L}*|цел\\p{L}*'), 'goal');
  q = q.replace(rx('устройств\\p{L}*'), 'device');
  q = q.replace(rx('браузер\\p{L}*'), 'browser');
  q = q.replace(rx('топ'), 'top');
  q = q.replace(rx('статистик\\p{L}*|выгруз\\p{L}*|отч[её]т\\p{L}*'), 'stats');

  // dimension "(в разбивке) по <dim>" → "by <dim>" (slice). Only before a known
  // dimension word so a stray "по" in prose isn't turned into a slice.
  q = q.replace(new RegExp(`${BL}(?:в\\s+разбивке\\s+по|разбивке\\s+по|по)\\s+(${DIM})${BR}`, 'giu'), 'by $1');

  // time periods
  q = q.replace(rx('сегодня'), 'today');
  q = q.replace(rx('вчера'), 'yesterday');
  q = q.replace(rx('за\\s+(?:прошл\\p{L}*|последн\\p{L}*)\\s+недел\\p{L}*|прошл\\p{L}*\\s+недел\\p{L}*'), 'last week');
  q = q.replace(rx('за\\s+эт\\p{L}*\\s+недел\\p{L}*|эт\\p{L}*\\s+недел\\p{L}*'), 'this week');
  q = q.replace(rx('за\\s+(?:прошл\\p{L}*|последн\\p{L}*)\\s+месяц\\p{L}*|прошл\\p{L}*\\s+месяц\\p{L}*'), 'last month');
  q = q.replace(rx('за\\s+эт\\p{L}*\\s+месяц\\p{L}*|эт\\p{L}*\\s+месяц\\p{L}*|текущ\\p{L}*\\s+месяц\\p{L}*'), 'this month');

  // drop common noise tokens
  q = q.replace(/(?<![\p{L}])(?:ао|за|для|по|мне|нам|пожалуйста)(?![\p{L}])/gu, ' ');

  // collapse whitespace and de-duplicate adjacent identical English words
  // ("выгрузи"+"статистику" both → "stats stats")
  q = q.replace(/\s+/g, ' ').trim();
  q = q.replace(/\b([a-z]+)(?:\s+\1\b)+/gi, '$1');

  return q;
}

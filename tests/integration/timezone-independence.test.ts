/**
 * Date arithmetic must not depend on the machine's timezone.
 *
 * The 6-month range guard shipped a version that read UTC-parsed dates back
 * through local accessors. `new Date('2026-03-01')` is UTC midnight, so
 * anywhere west of UTC `getDate()` returns the previous day — which rejected
 * legal six-month ranges across the whole of the Americas and let
 * six-months-plus-a-day through. The unit suite stayed green because the
 * runner sits in a positive offset and the boundary cases chosen happened to
 * be timezone-insensitive.
 *
 * A test that merely asserts the guard's behaviour in the runner's own
 * timezone cannot catch that. This one spawns Node with TZ set, so the
 * assertion runs where the bug lived.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');
const MODULE = resolve(ROOT, 'build/services/validation-service.js');

/** Ranges the guard must accept, and ranges it must reject, in every timezone. */
const LEGAL: Array<[string, string, string]> = [
  ['2026-03-01', '2026-09-01', 'exactly six months across a DST boundary'],
  ['2026-05-01', '2026-11-01', 'exactly six months across the other DST boundary'],
  ['2026-01-01', '2026-07-01', 'exactly six months, no DST involved'],
  ['2026-01-31', '2026-07-30', 'touches seven calendar months but is 180 days'],
  ['2026-02-29', '2026-08-29', 'six months from a leap day'],
];

const ILLEGAL: Array<[string, string, string]> = [
  ['2026-03-31', '2026-10-01', 'six months plus a day'],
  ['2026-01-01', '2026-07-30', '210 days inside six calendar months'],
  ['2026-01-01', '2026-08-01', 'seven calendar months'],
];

/** Zones on both sides of UTC, including one with a non-hour offset. */
const ZONES = ['UTC', 'America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo', 'Asia/Kolkata'];

function guardVerdicts(tz: string): Record<string, boolean> {
  const script = `
    const { ValidationService } = require(${JSON.stringify(MODULE)});
    const v = new ValidationService();
    const out = {};
    for (const [from, to] of ${JSON.stringify([...LEGAL, ...ILLEGAL].map(([a, b]) => [a, b]))}) {
      try {
        v.normalizeStatsParams({ slice: ['day'], date_from: from, date_to: to });
        out[from + '..' + to] = false;
      } catch (err) {
        out[from + '..' + to] = /6 months/.test(String(err && err.message));
      }
    }
    process.stdout.write(JSON.stringify(out));
  `;
  const stdout = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  return JSON.parse(stdout);
}

describe.skipIf(!existsSync(MODULE))('date arithmetic is timezone-independent', () => {
  for (const tz of ZONES) {
    it(`gives the same verdicts in ${tz}`, () => {
      const verdicts = guardVerdicts(tz);

      const wronglyRejected = LEGAL
        .filter(([from, to]) => verdicts[`${from}..${to}`])
        .map(([from, to, why]) => `${from}..${to} (${why})`);
      expect(wronglyRejected, `legal ranges rejected in ${tz}`).toEqual([]);

      const wronglyAllowed = ILLEGAL
        .filter(([from, to]) => !verdicts[`${from}..${to}`])
        .map(([from, to, why]) => `${from}..${to} (${why})`);
      expect(wronglyAllowed, `over-long ranges allowed in ${tz}`).toEqual([]);
    });
  }

  it('agrees with itself across every zone', () => {
    const baseline = guardVerdicts('UTC');
    for (const tz of ZONES.slice(1)) {
      expect(guardVerdicts(tz), `${tz} disagrees with UTC`).toEqual(baseline);
    }
  });
});

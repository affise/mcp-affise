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
  ['2024-02-29', '2024-08-29', 'six months from a real leap day'],
  ['2023-12-15', '2024-06-15', 'six months across a year boundary into a leap year'],
];

const ILLEGAL: Array<[string, string, string]> = [
  ['2026-03-31', '2026-10-01', 'six months plus a day'],
  ['2026-01-01', '2026-07-30', '210 days inside six calendar months'],
  ['2026-01-01', '2026-08-01', 'seven calendar months'],
];

/** Zones on both sides of UTC, including one with a non-hour offset. */
const ZONES = ['UTC', 'America/New_York', 'Pacific/Honolulu', 'Asia/Tokyo', 'Asia/Kolkata'];

function guardVerdicts(tz: string): Record<string, boolean | string> {
  const script = `
    const { ValidationService } = require(${JSON.stringify(MODULE)});
    const v = new ValidationService();
    const out = {};
    for (const [from, to] of ${JSON.stringify([...LEGAL, ...ILLEGAL].map(([a, b]) => [a, b]))}) {
      try {
        v.normalizeStatsParams({ slice: ['day'], date_from: from, date_to: to });
        out[from + '..' + to] = false;
      } catch (err) {
        const message = String(err && err.message);
        // Anything that is not the range verdict is a broken harness, not a
        // verdict. Classifying it as "allowed" would let a LEGAL row pass on
        // an error that never reached the guard at all.
        out[from + '..' + to] = /6 months/.test(message) ? true : 'ERROR: ' + message;
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

describe('date arithmetic is timezone-independent', () => {
  it('has a built module to check', () => {
    // Previously `describe.skipIf(!existsSync(MODULE))`, which reported six
    // skipped tests and exit 0 on a tree with no build — the same silent-pass
    // shape this file exists to catch.
    expect(existsSync(MODULE), `no build at ${MODULE} — run \`npm run build\` first`).toBe(true);
  });

  for (const tz of ZONES) {
    it(`gives the same verdicts in ${tz}`, () => {
      const verdicts = guardVerdicts(tz);

      const broken = Object.entries(verdicts)
        .filter(([, v]) => typeof v === 'string')
        .map(([range, v]) => `${range} -> ${v}`);
      expect(broken, `the guard threw something other than a range verdict in ${tz}`).toEqual([]);

      const wronglyRejected = LEGAL
        .filter(([from, to]) => verdicts[`${from}..${to}`] === true)
        .map(([from, to, why]) => `${from}..${to} (${why})`);
      expect(wronglyRejected, `legal ranges rejected in ${tz}`).toEqual([]);

      const wronglyAllowed = ILLEGAL
        .filter(([from, to]) => verdicts[`${from}..${to}`] !== true)
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

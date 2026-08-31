/**
 * Period-over-period range alignment.
 *
 * "this month vs last" is misleading if compared naively: `thismonth` is
 * month-to-date (partial) while `lastmonth` is a full month. This helper
 * produces a baseline range of the SAME length / day-offset as the current
 * range, so MTD compares against the same day-range of the prior period.
 *
 * Rules by period family:
 *   - calendar this/last month, quarter, year → shift back one unit,
 *     keeping the same day-of-month, clamped to the baseline month's length.
 *   - week (thisweek/lastweek) → shift back exactly 7 days (same weekdays).
 *   - rolling windows (last7days, last30days, last3months, last6months) and
 *     single days (today/yesterday) → the equal-length window immediately
 *     before the current range.
 */

import {
  DatePeriod,
  DateRange,
  getDateRange,
  addDays,
  formatDateString,
  parseDateString,
  daysBetween,
} from '../shared/date-utils.js';

export interface AlignedRanges {
  period: DatePeriod;
  current: DateRange;
  baseline: DateRange;
  currentDays: number;
  baselineDays: number;
  /** true when the current period is still in progress (MTD/WTD/etc.). */
  partial: boolean;
  note: string;
}

const WEEK_PERIODS = new Set<DatePeriod>(['thisweek', 'lastweek']);

// How many calendar months to shift back for each calendar-aligned period.
const MONTH_SHIFT: Partial<Record<DatePeriod, number>> = {
  thismonth: 1, lastmonth: 1,
  thisquarter: 3, lastquarter: 3,
  thisyear: 12, lastyear: 12,
  q1: 12, q2: 12, q3: 12, q4: 12,
};

/** Shift a date back by `n` months, clamping the day to the target month's length. */
function shiftMonths(d: Date, n: number): Date {
  const anchor = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  return new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(d.getDate(), lastDay));
}

/** The equal-length window ending the day before `range` starts. */
export function precedingWindow(range: DateRange): DateRange {
  const from = parseDateString(range.from);
  const to = parseDateString(range.to);
  const len = daysBetween(from, to);
  const bTo = addDays(from, -1);
  const bFrom = addDays(bTo, -(len - 1));
  return { from: formatDateString(bFrom), to: formatDateString(bTo) };
}

/**
 * Compute aligned current + baseline ranges for a named period.
 *
 * @param period      named period (thismonth, lastweek, last7days, …)
 * @param opts.referenceDate  "today" override (for tests / fixed clocks)
 * @param opts.includeToday   end the current range at today (default) or yesterday
 */
export function alignedRanges(
  period: DatePeriod,
  opts: { referenceDate?: Date; includeToday?: boolean } = {},
): AlignedRanges {
  const includeToday = opts.includeToday ?? true;
  const current = getDateRange(period, { referenceDate: opts.referenceDate, includeToday });
  const cFrom = parseDateString(current.from);
  const cTo = parseDateString(current.to);

  let baseline: DateRange;
  if (WEEK_PERIODS.has(period)) {
    baseline = {
      from: formatDateString(addDays(cFrom, -7)),
      to: formatDateString(addDays(cTo, -7)),
    };
  } else if (MONTH_SHIFT[period] !== undefined) {
    const n = MONTH_SHIFT[period]!;
    baseline = {
      from: formatDateString(shiftMonths(cFrom, -n)),
      to: formatDateString(shiftMonths(cTo, -n)),
    };
  } else {
    baseline = precedingWindow(current);
  }

  const currentDays = daysBetween(cFrom, cTo);
  const baselineDays = daysBetween(parseDateString(baseline.from), parseDateString(baseline.to));
  const partial = /^this/.test(period);

  const cd = `${currentDays} day${currentDays === 1 ? '' : 's'}`;
  const bd = `${baselineDays} day${baselineDays === 1 ? '' : 's'}`;
  const note =
    `current = ${current.from}…${current.to} (${cd}${partial ? ', in progress' : ''}); ` +
    `baseline aligned to ${baseline.from}…${baseline.to} (${bd})`;

  return { period, current, baseline, currentDays, baselineDays, partial, note };
}

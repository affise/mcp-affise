/**
 * 📅 Enhanced Date Utilities
 * Centralized date handling system to eliminate duplication across the project
 */

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type DatePeriod = 
  | 'today' 
  | 'yesterday' 
  | 'last7days' 
  | 'last30days' 
  | 'thismonth' 
  | 'lastmonth' 
  | 'thisquarter' 
  | 'lastquarter'
  | 'thisweek'
  | 'lastweek'
  | 'last3months'
  | 'last6months'
  | 'thisyear'
  | 'lastyear'
  | 'q1' 
  | 'q2' 
  | 'q3' 
  | 'q4';

export interface DateRange {
  from: string;  // YYYY-MM-DD format
  to: string;    // YYYY-MM-DD format
}

export interface DateInfo {
  range: DateRange;
  label: string;
  description: string;
  dayCount: number;
}

export interface RelativeDateOptions {
  includeToday?: boolean;
  timezone?: string;
  referenceDate?: Date;
}

// ============================================================================
// CORE DATE UTILITIES
// ============================================================================

/**
 * Get current timestamp in ISO format
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDateString(date: Date): string {
  // Use local date parts to avoid timezone issues
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse date string (YYYY-MM-DD) to Date object
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get today's date as Date object (without time)
 */
export function getToday(referenceDate?: Date): Date {
  const now = referenceDate || new Date();
  // Create a new date with time set to midnight in local timezone
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Add/subtract days from a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add/subtract months from a date
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Get start and end of month for a given date
 */
export function getMonthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start, end };
}

/**
 * Get start and end of week for a given date (Monday-Sunday)
 */
export function getWeekBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  const dayOfWeek = start.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Handle Sunday as 0
  start.setDate(start.getDate() + mondayOffset);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  
  return { start, end };
}

/**
 * Calculate number of days between two dates
 */
export function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

// ============================================================================
// QUARTER UTILITIES  
// ============================================================================

/**
 * Get the current quarter (0-3)
 */
export function getCurrentQuarter(date: Date = new Date()): number {
  return Math.floor(date.getMonth() / 3);
}

/**
 * Get quarter name (Q1, Q2, Q3, Q4)
 */
export function getQuarterName(quarter: number): string {
  return `Q${quarter + 1}`;
}

/**
 * Get quarter date range for a specific year and quarter
 */
export function getQuarterDateRange(year: number, quarter: number): DateRange {
  const quarterStartMonth = quarter * 3;
  const quarterEndMonth = quarterStartMonth + 2;
  
  const start = new Date(year, quarterStartMonth, 1);
  const end = new Date(year, quarterEndMonth + 1, 0);
  
  return {
    from: formatDateString(start),
    to: formatDateString(end)
  };
}

/**
 * Get all quarters for a given year
 */
export function getYearQuarters(year: number): Array<{ quarter: number; name: string; range: DateRange }> {
  return [0, 1, 2, 3].map(quarter => ({
    quarter,
    name: getQuarterName(quarter),
    range: getQuarterDateRange(year, quarter)
  }));
}

// ============================================================================
// MAIN DATE RANGE FUNCTIONS
// ============================================================================

/**
 * Enhanced date range function with comprehensive period support
 */
export function getDateRange(period: DatePeriod, options: RelativeDateOptions = {}): DateRange {
  const { includeToday = true, referenceDate } = options;
  const today = getToday(referenceDate);
  
  switch (period) {
    case 'today':
      return {
        from: formatDateString(today),
        to: formatDateString(today)
      };
    
    case 'yesterday':
      const yesterday = addDays(today, -1);
      return {
        from: formatDateString(yesterday),
        to: formatDateString(yesterday)
      };
    
    case 'last7days':
      const week = addDays(today, -7);
      return {
        from: formatDateString(week),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    
    case 'last30days':
      const month = addDays(today, -30);
      return {
        from: formatDateString(month),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    
    case 'thisweek': {
      const { start, end } = getWeekBounds(today);
      return {
        from: formatDateString(start),
        to: formatDateString(includeToday ? today : end)
      };
    }
    
    case 'lastweek': {
      const lastWeekDate = addDays(today, -7);
      const { start, end } = getWeekBounds(lastWeekDate);
      return {
        from: formatDateString(start),
        to: formatDateString(end)
      };
    }
    
    case 'thismonth': {
      const { start } = getMonthBounds(today);
      return {
        from: formatDateString(start),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    }
    
    case 'lastmonth': {
      const lastMonthDate = addMonths(today, -1);
      const { start, end } = getMonthBounds(lastMonthDate);
      return {
        from: formatDateString(start),
        to: formatDateString(end)
      };
    }
    
    case 'last3months':
      const threeMonths = addMonths(today, -3);
      return {
        from: formatDateString(threeMonths),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    
    case 'last6months':
      const sixMonths = addMonths(today, -6);
      return {
        from: formatDateString(sixMonths),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    
    case 'thisquarter': {
      const currentQuarter = getCurrentQuarter(today);
      const quarterStart = new Date(today.getFullYear(), currentQuarter * 3, 1);
      return {
        from: formatDateString(quarterStart),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    }
    
    case 'lastquarter': {
      const lastQuarter = getCurrentQuarter(today) - 1;
      const lastQuarterYear = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const adjustedLastQuarter = lastQuarter < 0 ? 3 : lastQuarter;
      return getQuarterDateRange(lastQuarterYear, adjustedLastQuarter);
    }
    
    case 'thisyear': {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return {
        from: formatDateString(yearStart),
        to: formatDateString(includeToday ? today : addDays(today, -1))
      };
    }
    
    case 'lastyear': {
      const lastYear = today.getFullYear() - 1;
      return {
        from: formatDateString(new Date(lastYear, 0, 1)),
        to: formatDateString(new Date(lastYear, 11, 31))
      };
    }
    
    // Specific quarters
    case 'q1':
      return getQuarterDateRange(today.getFullYear(), 0);
    case 'q2':
      return getQuarterDateRange(today.getFullYear(), 1);
    case 'q3':
      return getQuarterDateRange(today.getFullYear(), 2);
    case 'q4':
      return getQuarterDateRange(today.getFullYear(), 3);
    
    default:
      // Fallback to today
      return {
        from: formatDateString(today),
        to: formatDateString(today)
      };
  }
}

/**
 * Get detailed information about a date period
 */
export function getDateInfo(period: DatePeriod, options: RelativeDateOptions = {}): DateInfo {
  const range = getDateRange(period, options);
  const startDate = parseDateString(range.from);
  const endDate = parseDateString(range.to);
  const dayCount = daysBetween(startDate, endDate);
  
  const labels: Record<DatePeriod, { label: string; description: string }> = {
    today: { label: 'Today', description: 'Current day' },
    yesterday: { label: 'Yesterday', description: 'Previous day' },
    last7days: { label: 'Last 7 Days', description: 'Past week including today' },
    last30days: { label: 'Last 30 Days', description: 'Past month including today' },
    thisweek: { label: 'This Week', description: 'Current week (Monday-Sunday)' },
    lastweek: { label: 'Last Week', description: 'Previous week (Monday-Sunday)' },
    thismonth: { label: 'This Month', description: 'Current calendar month' },
    lastmonth: { label: 'Last Month', description: 'Previous calendar month' },
    last3months: { label: 'Last 3 Months', description: 'Past 3 months including today' },
    last6months: { label: 'Last 6 Months', description: 'Past 6 months including today' },
    thisquarter: { label: 'This Quarter', description: 'Current quarter' },
    lastquarter: { label: 'Last Quarter', description: 'Previous quarter' },
    thisyear: { label: 'This Year', description: 'Current calendar year' },
    lastyear: { label: 'Last Year', description: 'Previous calendar year' },
    q1: { label: 'Q1', description: 'First quarter (Jan-Mar)' },
    q2: { label: 'Q2', description: 'Second quarter (Apr-Jun)' },
    q3: { label: 'Q3', description: 'Third quarter (Jul-Sep)' },
    q4: { label: 'Q4', description: 'Fourth quarter (Oct-Dec)' }
  };
  
  const { label, description } = labels[period];
  
  return {
    range,
    label,
    description,
    dayCount
  };
}

// ============================================================================
// VALIDATION AND UTILITIES
// ============================================================================

/**
 * Validate date string format (YYYY-MM-DD)
 */
export function isValidDateString(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  
  const date = parseDateString(dateStr);
  return !isNaN(date.getTime()) && formatDateString(date) === dateStr;
}

/**
 * Validate date range (from <= to)
 */
export function isValidDateRange(range: DateRange): boolean {
  if (!isValidDateString(range.from) || !isValidDateString(range.to)) {
    return false;
  }
  
  const from = parseDateString(range.from);
  const to = parseDateString(range.to);
  
  return from <= to;
}

/**
 * Get all available date periods
 */
export function getAvailablePeriods(): Array<{ period: DatePeriod; label: string; description: string }> {
  const periods: DatePeriod[] = [
    'today', 'yesterday', 'last7days', 'last30days',
    'thisweek', 'lastweek', 'thismonth', 'lastmonth',
    'last3months', 'last6months', 'thisquarter', 'lastquarter',
    'thisyear', 'lastyear', 'q1', 'q2', 'q3', 'q4'
  ];
  
  return periods.map(period => {
    const info = getDateInfo(period);
    return {
      period,
      label: info.label,
      description: info.description
    };
  });
}

/**
 * Create date range from custom start/end dates with validation
 */
export function createDateRange(from: string, to: string): DateRange {
  if (!isValidDateString(from)) {
    throw new Error(`Invalid start date format: ${from}. Expected YYYY-MM-DD`);
  }
  
  if (!isValidDateString(to)) {
    throw new Error(`Invalid end date format: ${to}. Expected YYYY-MM-DD`);
  }
  
  const range = { from, to };
  
  if (!isValidDateRange(range)) {
    throw new Error(`Invalid date range: start date (${from}) must be before or equal to end date (${to})`);
  }
  
  return range;
}

/**
 * Smart date range builder that handles various input formats
 */
export function buildDateRange(input: {
  period?: DatePeriod;
  from?: string;
  to?: string;
  defaultPeriod?: DatePeriod;
  options?: RelativeDateOptions;
}): DateRange {
  const { period, from, to, defaultPeriod = 'last7days', options = {} } = input;
  
  // If custom dates provided, use them
  if (from && to) {
    return createDateRange(from, to);
  }
  
  // If period provided, use it
  if (period) {
    return getDateRange(period, options);
  }
  
  // Fall back to default period
  return getDateRange(defaultPeriod, options);
}

// ============================================================================
// ADVANCED DATE UTILITIES
// ============================================================================

/**
 * Get business days between two dates (excludes weekends)
 */
export function getBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday or Saturday
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Check if a date falls within a range
 */
export function isDateInRange(date: string, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

/**
 * Get overlapping period between two date ranges
 */
export function getOverlapPeriod(range1: DateRange, range2: DateRange): DateRange | null {
  const start = range1.from > range2.from ? range1.from : range2.from;
  const end = range1.to < range2.to ? range1.to : range2.to;
  
  if (start <= end) {
    return { from: start, to: end };
  }
  
  return null; // No overlap
}

/**
 * Format date range for display
 */
export function formatDateRangeDisplay(range: DateRange, format: 'short' | 'long' = 'short'): string {
  const startDate = parseDateString(range.from);
  const endDate = parseDateString(range.to);
  
  if (format === 'short') {
    return `${range.from} to ${range.to}`;
  }
  
  const formatOptions: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  
  const startFormatted = startDate.toLocaleDateString('en-US', formatOptions);
  const endFormatted = endDate.toLocaleDateString('en-US', formatOptions);
  
  return `${startFormatted} to ${endFormatted}`;
}

// ============================================================================
// LEGACY COMPATIBILITY (for backward compatibility)
// ============================================================================

/**
 * @deprecated Use getDateRange instead
 */
export function getCurrentQuarterRange(): DateRange {
  return getDateRange('thisquarter');
}

/**
 * @deprecated Use getDateRange instead  
 */
export function getLastQuarterRange(): DateRange {
  return getDateRange('lastquarter');
}

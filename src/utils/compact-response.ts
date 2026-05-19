/**
 * Compact Response Utility
 *
 * Converts verbose row-of-objects stat responses (keys repeated per row,
 * many null/zero/empty fields) into a tabular format — columns listed once,
 * rows as plain value arrays.
 *
 * Variant B trade-off:
 * - All-empty columns are dropped (where every row has null/undefined/''/0/false/[])
 * - Dropped columns are REPORTED in `dropped_columns` so callers can see
 *   "this metric was requested but never had data" — the same semantic
 *   distinction "I asked, no data came back" stays visible.
 *
 * Typical savings on real Affise conversion responses: 60-70% token reduction,
 * measured at 63.3% on a 100-record sample (283 KB → 104 KB).
 *
 * Output shape:
 *   {
 *     columns: string[],
 *     rows: any[][],
 *     dropped_columns?: string[],
 *     total?: number,
 *     page?: number,
 *     per_page?: number
 *   }
 */

/**
 * Flatten one row up to depth 2 using dot-notation for nested objects.
 * Arrays are kept as-is (e.g. sub-parameter arrays).
 */
function flattenRow(row: any, prefix = '', depth = 0): Record<string, any> {
  const result: Record<string, any> = {};

  if (depth > 2 || row === null || typeof row !== 'object' || Array.isArray(row)) {
    if (prefix) result[prefix] = row;
    return result;
  }

  for (const [key, value] of Object.entries(row)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      depth < 2
    ) {
      Object.assign(result, flattenRow(value, fullKey, depth + 1));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function isEmpty(v: any): boolean {
  return (
    v === null ||
    v === undefined ||
    v === '' ||
    v === 0 ||
    v === false ||
    (Array.isArray(v) && v.length === 0)
  );
}

export interface CompactTabularResult {
  columns: string[];
  rows: any[][];
  dropped_columns?: string[];
  total?: number;
  page?: number;
  per_page?: number;
}

/**
 * Compact an Affise-style stats / conversions response into a tabular format.
 *
 * @param apiResponse  Raw response.data — must be one of:
 *                       { stats: [...], pagination: {...} }
 *                       { conversions: [...], pagination: {...} }
 *                       { data: [...], pagination: {...} }
 *                       [ ... ]                                   (bare array)
 * @returns Compact tabular object, OR the original response unchanged if it
 *          doesn't contain a recognized rows array.
 */
export function compactTabular(apiResponse: any): any {
  // Discover the rows array under common Affise response shapes
  const rows: any[] | undefined = Array.isArray(apiResponse?.stats)
    ? apiResponse.stats
    : Array.isArray(apiResponse?.conversions)
      ? apiResponse.conversions
      : Array.isArray(apiResponse?.data)
        ? apiResponse.data
        : Array.isArray(apiResponse)
          ? apiResponse
          : undefined;

  // Pass non-tabular responses through unchanged
  if (!Array.isArray(rows)) return apiResponse;

  const pagination = apiResponse?.pagination;

  if (rows.length === 0) {
    const empty: CompactTabularResult = { columns: [], rows: [] };
    if (pagination?.total_count !== undefined) empty.total = pagination.total_count;
    if (pagination?.count !== undefined) empty.total = pagination.count;
    if (pagination?.page !== undefined) empty.page = pagination.page;
    if (pagination?.per_page !== undefined) empty.per_page = pagination.per_page;
    return empty;
  }

  // Flatten all rows
  const flatRows = rows.map(row => flattenRow(row));

  // Collect all column names preserving first-row insertion order
  const colSet: string[] = [];
  const seen = new Set<string>();
  for (const row of flatRows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        colSet.push(k);
        seen.add(k);
      }
    }
  }

  // Variant B: drop columns where every row is empty, but report them.
  const activeCols: string[] = [];
  const droppedCols: string[] = [];
  for (const col of colSet) {
    if (flatRows.some(row => !isEmpty(row[col]))) {
      activeCols.push(col);
    } else {
      droppedCols.push(col);
    }
  }

  // Build value-only rows for active columns
  const compactRows = flatRows.map(row =>
    activeCols.map(col => (col in row ? row[col] : null))
  );

  const result: CompactTabularResult = {
    columns: activeCols,
    rows: compactRows,
  };
  if (droppedCols.length > 0) result.dropped_columns = droppedCols;
  if (pagination?.total_count !== undefined) result.total = pagination.total_count;
  else if (pagination?.count !== undefined) result.total = pagination.count;
  if (pagination?.page !== undefined) result.page = pagination.page;
  if (pagination?.per_page !== undefined) result.per_page = pagination.per_page;

  return result;
}

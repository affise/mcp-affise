/**
 * Compact Response Utility
 *
 * Converts verbose row-of-objects stat responses (keys repeated per row,
 * many null/zero/empty fields) into a tabular format — columns listed once,
 * rows as plain value arrays.
 *
 * Variant B trade-off:
 * - All-empty columns are dropped (where every row has null/undefined/''/0/
 *   false/[] or a string zero like "0"/"0.00" — Affise returns traffic and
 *   money metrics as strings)
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
    (typeof v === 'string' && /^0(\.0+)?$/.test(v)) ||
    (Array.isArray(v) && v.length === 0)
  );
}

/**
 * Recursively drop any property whose key is in `keys` from each record
 * (and from nested objects/arrays). Used to strip secrets and heavy/low-value
 * fields out of list payloads BEFORE compactTabular flattens them into
 * columns — both for security (e.g. partner/manager `api_key`) and to keep
 * the result under the host's inline tool-result budget.
 *
 * Returns fresh objects; the input records are not mutated.
 */
export function redactKeys<T>(records: T[], keys: string[]): T[] {
  const drop = new Set(keys);
  const scrub = (v: any): any => {
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (drop.has(k)) continue;
        out[k] = scrub(val);
      }
      return out;
    }
    return v;
  };
  return Array.isArray(records) ? records.map(scrub) : records;
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

/**
 * Project a compactTabular grid down to a requested subset of columns.
 *
 * A conversion row carries ~77 non-empty columns; 1000 of them blows past the
 * host's 1 MB tool-result ceiling. Narrowing to ~14 columns shrinks the
 * payload ~5-6x so the whole result (rows × columns) fits and the model can
 * consume every row at once (e.g. to build an export). Affise's
 * `/3.0/stats/conversions` ignores its own `fields` query param, so we project
 * here — on the already-flattened grid whose column names are exactly the
 * dotted paths callers use (`offer.id`, `partner.login`).
 *
 * Columns come back in the requested order. Field names that don't exist in
 * the grid (empty/dropped columns, typos) are skipped. If nothing matches the
 * grid is returned unchanged — better a full result than an empty one.
 */
export function projectGridColumns(grid: any, fieldsCsv: string | undefined): any {
  if (!fieldsCsv || !grid || !Array.isArray(grid.columns) || !Array.isArray(grid.rows)) {
    return grid;
  }
  const want = fieldsCsv.split(',').map(s => s.trim()).filter(Boolean);
  if (want.length === 0) return grid;

  const idxs: number[] = [];
  const keptCols: string[] = [];
  for (const f of want) {
    const i = grid.columns.indexOf(f);
    if (i !== -1) { idxs.push(i); keptCols.push(grid.columns[i]); }
  }
  if (idxs.length === 0) return grid; // no requested field exists — leave as-is

  const removed = grid.columns.filter((_: string, i: number) => !idxs.includes(i));
  return {
    ...grid,
    columns: keptCols,
    rows: grid.rows.map((r: any[]) => idxs.map(i => r[i])),
    dropped_columns: [
      ...(Array.isArray(grid.dropped_columns) ? grid.dropped_columns : []),
      ...removed,
    ],
  };
}

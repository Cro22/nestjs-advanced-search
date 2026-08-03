export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Deepest reachable result, mirroring the Elasticsearch max_result_window
 * default. Requests where page times pageSize exceed this are rejected up
 * front instead of failing inside the engine.
 */
export const MAX_SEARCH_WINDOW = 10000;

/** Clamp a requested page size into a safe range to protect the engine. */
export function clampPageSize(requested: number | undefined, max: number): number {
  if (!requested || requested < 1) {
    // The default itself is capped by max, so the result never exceeds the
    // configured ceiling even when max is smaller than the default.
    return Math.min(DEFAULT_PAGE_SIZE, max);
  }
  return Math.min(requested, max);
}

export function normalizePage(requested: number | undefined): number {
  if (!requested || requested < 1) {
    return DEFAULT_PAGE;
  }
  return Math.floor(requested);
}

/**
 * Opaque cursor for deep pagination. It carries the sort values of the last hit
 * on a page so the next page can resume with Elasticsearch `search_after`,
 * which pages arbitrarily deep at constant cost (no `max_result_window` limit).
 * The payload is just base64url over the sort tuple; it holds no secret, only a
 * position, so it needs no signing.
 */
export function encodeCursor(sortValues: readonly unknown[]): string {
  return Buffer.from(JSON.stringify(sortValues), 'utf8').toString('base64url');
}

/** Decode a cursor back into its sort tuple, or null when it is malformed. */
export function decodeCursor(cursor: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

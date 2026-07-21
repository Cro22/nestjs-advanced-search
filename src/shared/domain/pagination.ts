export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;

/** Clamp a requested page size into a safe range to protect the engine. */
export function clampPageSize(requested: number | undefined, max: number): number {
  if (!requested || requested < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(requested, max);
}

export function normalizePage(requested: number | undefined): number {
  if (!requested || requested < 1) {
    return DEFAULT_PAGE;
  }
  return Math.floor(requested);
}

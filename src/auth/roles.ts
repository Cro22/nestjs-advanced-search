/**
 * Coarse-grained roles carried by an API key. `admin` may mutate products;
 * `ingest` is a narrower role for the analytics pipeline that only records views.
 */
export const ROLES = ['admin', 'ingest'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * Generation counter shared by every cached search key. The write path bumps
 * it once per mutation and read paths embed the current value in their keys,
 * so a write instantly invalidates all cached pages without scanning Redis.
 * Old generation entries simply expire through their TTL.
 */
export const GENERATION_KEY = 'search:generation';

/**
 * Version of the search schema, meaning the Elasticsearch mapping plus the
 * shape of cached search results. Bump it whenever either changes: the index
 * adapter derives the physical index name from it (so a bump triggers a clean
 * reindex on boot) and the cache keys embed it (so stale entries are ignored).
 */
export const SEARCH_SCHEMA_VERSION = 3;

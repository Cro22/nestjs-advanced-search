/**
 * Raised when the search backend cannot serve a query (for example the cluster
 * is unreachable or times out). It is a domain level signal: the HTTP layer maps
 * it to a 503 so a search outage never leaks a raw Elasticsearch error.
 */
export class SearchUnavailableError extends Error {
  constructor() {
    super('The search service is temporarily unavailable');
    this.name = 'SearchUnavailableError';
  }
}

/**
 * Raised when the request itself is malformed (inconsistent geo parameters,
 * pagination beyond the search window, a query the engine rejects). The HTTP
 * layer maps it to a 400 so client mistakes are never reported as outages.
 */
export class InvalidSearchQueryError extends Error {
  constructor(message = 'The search query is invalid') {
    super(message);
    this.name = 'InvalidSearchQueryError';
  }
}

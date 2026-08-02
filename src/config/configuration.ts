export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  logLevel: string;
  throttle: {
    ttlMs: number;
    limit: number;
    keyPrefix: string;
    failOpen: boolean;
  };
  outbox: {
    pollMs: number;
    batchSize: number;
    maxAttempts: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    lockMs: number;
    retentionMs: number;
  };
  elasticsearch: {
    node: string;
    index: string;
    username?: string;
    password?: string;
  };
  redis: {
    host: string;
    port: number;
    ttlSeconds: number;
    password?: string;
  };
  search: {
    maxPageSize: number;
    autocompleteMaxSuggestions: number;
  };
  auth: {
    apiKeys: { key: string; role: string }[];
  };
  cors: {
    origins: string[];
  };
  swagger: {
    enabled: boolean;
  };
}

/** Parse a comma separated list, trimming blanks. */
function parseList(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Parse `key1:admin,key2:ingest` into structured API key entries. */
function parseApiKeys(raw?: string): { key: string; role: string }[] {
  return parseList(raw)
    .map((pair) => {
      const separator = pair.indexOf(':');
      const key = separator >= 0 ? pair.slice(0, separator).trim() : pair;
      const role = separator >= 0 ? pair.slice(separator + 1).trim() : '';
      return { key, role };
    })
    .filter((entry) => entry.key.length > 0);
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
    keyPrefix: process.env.THROTTLE_KEY_PREFIX ?? '',
    failOpen: (process.env.THROTTLE_FAIL_OPEN ?? 'true') !== 'false',
  },
  outbox: {
    pollMs: parseInt(process.env.OUTBOX_POLL_MS ?? '5000', 10),
    batchSize: parseInt(process.env.OUTBOX_BATCH_SIZE ?? '100', 10),
    maxAttempts: parseInt(process.env.OUTBOX_MAX_ATTEMPTS ?? '10', 10),
    backoffBaseMs: parseInt(process.env.OUTBOX_BACKOFF_BASE_MS ?? '1000', 10),
    backoffMaxMs: parseInt(process.env.OUTBOX_BACKOFF_MAX_MS ?? '60000', 10),
    lockMs: parseInt(process.env.OUTBOX_LOCK_MS ?? '60000', 10),
    retentionMs: parseInt(process.env.OUTBOX_RETENTION_MS ?? '604800000', 10),
  },
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    index: process.env.ELASTICSEARCH_PRODUCT_INDEX ?? 'products',
    // Optional basic auth, used when the cluster runs with security enabled.
    username: process.env.ELASTICSEARCH_USERNAME || undefined,
    password: process.env.ELASTICSEARCH_PASSWORD || undefined,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    ttlSeconds: parseInt(process.env.REDIS_TTL_SECONDS ?? '60', 10),
    // Optional, used when Redis runs with requirepass.
    password: process.env.REDIS_PASSWORD || undefined,
  },
  search: {
    maxPageSize: parseInt(process.env.SEARCH_MAX_PAGE_SIZE ?? '100', 10),
    autocompleteMaxSuggestions: parseInt(process.env.AUTOCOMPLETE_MAX_SUGGESTIONS ?? '10', 10),
  },
  auth: {
    apiKeys: parseApiKeys(process.env.API_KEYS),
  },
  cors: {
    // Empty means no cross-origin access is granted in production (same-origin
    // only); development falls back to a permissive policy in app.setup.
    origins: parseList(process.env.CORS_ORIGINS),
  },
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') !== 'false',
  },
});

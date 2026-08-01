export interface AppConfig {
  env: string;
  port: number;
  apiPrefix: string;
  logLevel: string;
  throttle: {
    ttlMs: number;
    limit: number;
    keyPrefix: string;
  };
  outbox: {
    pollMs: number;
  };
  elasticsearch: {
    node: string;
    index: string;
  };
  redis: {
    host: string;
    port: number;
    ttlSeconds: number;
  };
  search: {
    maxPageSize: number;
    autocompleteMaxSuggestions: number;
  };
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
  },
  outbox: {
    pollMs: parseInt(process.env.OUTBOX_POLL_MS ?? '5000', 10),
  },
  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    index: process.env.ELASTICSEARCH_PRODUCT_INDEX ?? 'products',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    ttlSeconds: parseInt(process.env.REDIS_TTL_SECONDS ?? '60', 10),
  },
  search: {
    maxPageSize: parseInt(process.env.SEARCH_MAX_PAGE_SIZE ?? '100', 10),
    autocompleteMaxSuggestions: parseInt(process.env.AUTOCOMPLETE_MAX_SUGGESTIONS ?? '10', 10),
  },
});

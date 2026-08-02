import configuration from '@/config/configuration';

describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {};
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides safe local defaults', () => {
    expect(configuration()).toEqual(
      expect.objectContaining({
        env: 'development',
        port: 3000,
        apiPrefix: 'api',
        throttle: expect.objectContaining({ limit: 120, failOpen: true }),
        elasticsearch: expect.objectContaining({
          node: 'http://localhost:9200',
          username: undefined,
          password: undefined,
        }),
        redis: expect.objectContaining({ host: 'localhost', password: undefined }),
        auth: { apiKeys: [] },
        cors: { origins: [] },
        swagger: { enabled: true },
      }),
    );
  });

  it('parses environment overrides, lists and API key roles', () => {
    process.env = {
      NODE_ENV: 'production',
      PORT: '4000',
      API_PREFIX: 'v1',
      LOG_LEVEL: 'warn',
      THROTTLE_TTL_MS: '10',
      THROTTLE_LIMIT: '20',
      THROTTLE_KEY_PREFIX: 'edge',
      THROTTLE_FAIL_OPEN: 'false',
      OUTBOX_POLL_MS: '11',
      OUTBOX_BATCH_SIZE: '12',
      OUTBOX_MAX_ATTEMPTS: '13',
      OUTBOX_BACKOFF_BASE_MS: '14',
      OUTBOX_BACKOFF_MAX_MS: '15',
      OUTBOX_LOCK_MS: '16',
      OUTBOX_RETENTION_MS: '17',
      ELASTICSEARCH_NODE: 'https://search.example',
      ELASTICSEARCH_PRODUCT_INDEX: 'catalog',
      ELASTICSEARCH_USERNAME: 'elastic',
      ELASTICSEARCH_PASSWORD: 'secret',
      ELASTICSEARCH_REQUEST_TIMEOUT_MS: '18',
      ELASTICSEARCH_MAX_RETRIES: '2',
      REDIS_HOST: 'cache',
      REDIS_PORT: '6380',
      REDIS_TTL_SECONDS: '19',
      REDIS_PASSWORD: 'redis-secret',
      REDIS_CONNECT_TIMEOUT_MS: '20',
      REDIS_COMMAND_TIMEOUT_MS: '21',
      SEARCH_MAX_PAGE_SIZE: '22',
      AUTOCOMPLETE_MAX_SUGGESTIONS: '23',
      API_KEYS: ' admin-key:admin, ingest-key:ingest, key-without-role, , :admin ',
      CORS_ORIGINS: ' https://one.example,https://two.example, ',
      SWAGGER_ENABLED: 'false',
    };

    const result = configuration();

    expect(result).toMatchObject({
      env: 'production',
      port: 4000,
      apiPrefix: 'v1',
      logLevel: 'warn',
      throttle: { ttlMs: 10, limit: 20, keyPrefix: 'edge', failOpen: false },
      outbox: {
        pollMs: 11,
        batchSize: 12,
        maxAttempts: 13,
        backoffBaseMs: 14,
        backoffMaxMs: 15,
        lockMs: 16,
        retentionMs: 17,
      },
      elasticsearch: {
        node: 'https://search.example',
        index: 'catalog',
        username: 'elastic',
        password: 'secret',
        requestTimeoutMs: 18,
        maxRetries: 2,
      },
      redis: {
        host: 'cache',
        port: 6380,
        ttlSeconds: 19,
        password: 'redis-secret',
        connectTimeoutMs: 20,
        commandTimeoutMs: 21,
      },
      search: { maxPageSize: 22, autocompleteMaxSuggestions: 23 },
      auth: {
        apiKeys: [
          { key: 'admin-key', role: 'admin' },
          { key: 'ingest-key', role: 'ingest' },
          { key: 'key-without-role', role: '' },
        ],
      },
      cors: { origins: ['https://one.example', 'https://two.example'] },
      swagger: { enabled: false },
    });
  });
});

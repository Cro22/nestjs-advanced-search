import { execSync } from 'node:child_process';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

export interface E2eContainers {
  postgres: StartedPostgreSqlContainer;
  elasticsearch: StartedTestContainer;
  redis: StartedRedisContainer;
}

/**
 * Boots the real backing services once for the whole e2e run. Jest starts
 * workers after this completes, so the process.env values assigned here are
 * inherited by every suite. Suites share the containers and run serially
 * (--runInBand) because they share one search index.
 */
export default async function globalSetup(): Promise<void> {
  const [postgres, elasticsearch, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    // Plain GenericContainer with security disabled, mirroring the compose
    // stack, so no credential plumbing is needed.
    new GenericContainer('docker.elastic.co/elasticsearch/elasticsearch:8.14.3')
      .withEnvironment({
        'discovery.type': 'single-node',
        'xpack.security.enabled': 'false',
        ES_JAVA_OPTS: '-Xms512m -Xmx512m',
      })
      .withExposedPorts(9200)
      .withWaitStrategy(
        Wait.forHttp('/_cluster/health?wait_for_status=yellow&timeout=1s', 9200).forStatusCode(200),
      )
      .withStartupTimeout(180_000)
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ]);

  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.DATABASE_URL = postgres.getConnectionUri();
  process.env.ELASTICSEARCH_NODE = `http://${elasticsearch.getHost()}:${elasticsearch.getMappedPort(9200)}`;
  process.env.ELASTICSEARCH_PRODUCT_INDEX = 'products';
  process.env.REDIS_HOST = redis.getHost();
  process.env.REDIS_PORT = String(redis.getMappedPort(6379));
  // Supertest hammers a single IP; open the throttle wide by default. Suites
  // that exercise rate limiting override these per app instance.
  process.env.THROTTLE_LIMIT = '100000';
  process.env.THROTTLE_AUTOCOMPLETE_LIMIT = '100000';

  execSync('npx prisma db push', {
    stdio: 'inherit',
    env: { ...process.env },
  });

  (globalThis as Record<string, unknown>).__E2E_CONTAINERS__ = {
    postgres,
    elasticsearch,
    redis,
  } satisfies E2eContainers;
}

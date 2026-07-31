import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';

describe('GET /api/health (e2e)', () => {
  it('reports readiness with every backing service up', async () => {
    const app = await createTestApp();
    try {
      const res = await request(app.getHttpServer()).get('/api/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.info.postgres.status).toBe('up');
      expect(res.body.info.elasticsearch.status).toBe('up');
      expect(res.body.info.redis.status).toBe('up');
    } finally {
      await app.close();
    }
  });

  it('returns 503 on readiness when a dependency is down, while liveness stays 200', async () => {
    // Point Redis at a closed port: the app still boots (the cache degrades
    // gracefully) but readiness must flag the outage.
    const app = await createTestApp({ REDIS_PORT: '6390' });
    try {
      const res = await request(app.getHttpServer()).get('/api/health').expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error.redis.status).toBe('down');

      await request(app.getHttpServer()).get('/api/health/liveness').expect(200);
    } finally {
      await app.close();
    }
  });
});

describe('rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ THROTTLE_LIMIT: '3', THROTTLE_TTL_MS: '60000' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('throttles search after the configured budget and never throttles health', async () => {
    const http = app.getHttpServer();
    for (let i = 0; i < 3; i += 1) {
      await request(http).get('/api/products/search').expect(200);
    }
    await request(http).get('/api/products/search').expect(429);

    // Health is exempt so orchestrator probes never see a 429.
    for (let i = 0; i < 5; i += 1) {
      await request(http).get('/api/health/liveness').expect(200);
    }
  });
});

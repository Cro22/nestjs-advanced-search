import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';

describe('GET /api/metrics (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp();
    http = app.getHttpServer();
    await resetData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes request latency, cache and process metrics in Prometheus format', async () => {
    // Generate some traffic so the histogram and cache counters have samples.
    await request(http).get('/api/products/search').query({ q: 'laptop' }).expect(200);
    await request(http).get('/api/products/search').query({ q: 'laptop' }).expect(200);

    const res = await request(http).get('/api/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toContain('route="/api/products/search"');
    // The second identical query was served from Redis.
    expect(res.text).toContain('cache_operations_total{operation="get",outcome="hit"}');
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('outbox_pending_entries');
  });
});

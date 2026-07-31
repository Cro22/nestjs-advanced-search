import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';

describe('GET /api/products/autocomplete (e2e)', () => {
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

  it('completes a prefix with product names', async () => {
    const res = await request(http)
      .get('/api/products/autocomplete')
      .query({ q: 'lap' })
      .expect(200);

    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.every((name: string) => name.toLowerCase().includes('lap'))).toBe(
      true,
    );
  });

  it('rescues a typo in the prefix', async () => {
    const res = await request(http)
      .get('/api/products/autocomplete')
      .query({ q: 'laptp' })
      .expect(200);

    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.some((name: string) => /Laptop/.test(name))).toBe(true);
  });

  it('deduplicates identical product names', async () => {
    const res = await request(http)
      .get('/api/products/autocomplete')
      .query({ q: 'pulse' })
      .expect(200);

    const monitors = res.body.suggestions.filter((name: string) => name === 'Pulse Monitor');
    expect(monitors).toHaveLength(1);
  });

  it('rejects an empty query', async () => {
    await request(http).get('/api/products/autocomplete').query({ q: '' }).expect(400);
  });
});

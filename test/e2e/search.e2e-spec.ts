import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';

describe('GET /api/products/search (e2e)', () => {
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

  it('ranks name matches above description matches', async () => {
    const res = await request(http).get('/api/products/search').query({ q: 'laptop' }).expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    // The top hits carry Laptop in the name; description only matches trail.
    const names: string[] = res.body.data.map((hit: { name: string }) => hit.name);
    const nameMatchCount = names.filter((name) => /Laptop/.test(name)).length;
    expect(nameMatchCount).toBeGreaterThanOrEqual(3);
    // Every name match ranks above every description only match.
    expect(names.slice(0, nameMatchCount).every((name) => /Laptop/.test(name))).toBe(true);
  });

  it('highlights the matched terms in name and description', async () => {
    const res = await request(http).get('/api/products/search').query({ q: 'laptop' }).expect(200);

    const withNameHighlight = res.body.data.find(
      (hit: { highlights?: { name?: string } }) => hit.highlights?.name,
    );
    expect(withNameHighlight.highlights.name).toContain('<em>');

    const withDescriptionHighlight = res.body.data.find(
      (hit: { highlights?: { description?: string } }) => hit.highlights?.description,
    );
    expect(withDescriptionHighlight.highlights.description).toContain('<em>laptop</em>');
  });

  it('tolerates typos in the free text query', async () => {
    const res = await request(http).get('/api/products/search').query({ q: 'laptp' }).expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name).toMatch(/Laptop/);
  });

  it('suggests corrections that are guaranteed to have results', async () => {
    const res = await request(http).get('/api/products/search').query({ q: 'labtop' }).expect(200);

    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.some((suggestion: string) => suggestion.includes('laptop'))).toBe(
      true,
    );
  });

  it('serves combined facets: a selected category keeps sibling counts', async () => {
    const res = await request(http)
      .get('/api/products/search')
      .query({ categories: 'Electronics' })
      .expect(200);

    expect(res.body.data.every((hit: { category: string }) => hit.category === 'Electronics')).toBe(
      true,
    );
    const categoryValues = res.body.facets.categories.map(
      (bucket: { value: string }) => bucket.value,
    );
    // Sibling categories stay visible even though the filter is active.
    expect(categoryValues).toContain('Home & Kitchen');
    expect(categoryValues).toContain('Books');
  });

  it('filters by price range', async () => {
    const res = await request(http)
      .get('/api/products/search')
      .query({ minPrice: 700, maxPrice: 1600 })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    for (const hit of res.body.data) {
      expect(hit.price).toBeGreaterThanOrEqual(700);
      expect(hit.price).toBeLessThanOrEqual(1600);
    }
  });

  it('restricts results to a geo radius', async () => {
    const res = await request(http)
      .get('/api/products/search')
      .query({ lat: 40.4168, lon: -3.7038, radiusKm: 25 })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((hit: { location: string }) => hit.location === 'Madrid')).toBe(
      true,
    );
    // Facets are constrained by the radius too.
    const locationValues = res.body.facets.locations.map(
      (bucket: { value: string }) => bucket.value,
    );
    expect(locationValues).toEqual(['Madrid']);
  });

  it('sorts by distance from the origin, nearest first', async () => {
    const res = await request(http)
      .get('/api/products/search')
      .query({ lat: 40.4168, lon: -3.7038, sort: 'distance' })
      .expect(200);

    const distances = res.body.data.map((hit: { distanceKm: number }) => hit.distanceKm);
    expect(distances.every((value: number) => typeof value === 'number')).toBe(true);
    const sorted = [...distances].sort((a, b) => a - b);
    expect(distances).toEqual(sorted);
    expect(res.body.data[0].location).toBe('Madrid');
    expect(res.body.data.at(-1).location).not.toBe('Madrid');
  });

  it('rejects pagination beyond the search window with a clear 400', async () => {
    const res = await request(http)
      .get('/api/products/search')
      .query({ page: 501, pageSize: 20 })
      .expect(400);

    expect(res.body.message).toContain('limited to the first 10000 results');
  });

  it('rejects a partial geo origin with a 400', async () => {
    const res = await request(http).get('/api/products/search').query({ lat: 40.4168 }).expect(400);
    expect(res.body.message).toContain('lat and lon must be provided together');
  });

  it('rejects distance sort without an origin', async () => {
    await request(http).get('/api/products/search').query({ sort: 'distance' }).expect(400);
  });

  it('sorts by popularity and by creation date', async () => {
    const byPopularity = await request(http)
      .get('/api/products/search')
      .query({ sort: 'popularity' })
      .expect(200);
    const popularities = byPopularity.body.data.map(
      (hit: { popularity: number }) => hit.popularity,
    );
    expect(popularities).toEqual([...popularities].sort((a, b) => b - a));

    const byDate = await request(http)
      .get('/api/products/search')
      .query({ sort: 'created_at', order: 'asc' })
      .expect(200);
    const dates = byDate.body.data.map((hit: { createdAt: string }) => hit.createdAt);
    expect(dates).toEqual([...dates].sort());
  });
});

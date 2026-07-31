import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-test-app';
import { resetData } from './fixtures';

describe('POST /api/products (e2e)', () => {
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

  it('creates a product that is searchable on the very next request', async () => {
    // Warm the cache with a query the new product will match, to prove the
    // generation bump invalidates it.
    const before = await request(http)
      .get('/api/products/search')
      .query({ q: 'zeppelin' })
      .expect(200);
    expect(before.body.meta.total).toBe(0);

    const created = await request(http)
      .post('/api/products')
      .send({
        name: 'Quantum Zeppelin Gadget',
        description: 'A one of a kind flying gadget',
        category: 'Electronics',
        subcategories: ['Wearables'],
        location: 'Madrid',
        latitude: 40.42,
        longitude: -3.7,
        price: 1234.56,
        popularity: 7,
      })
      .expect(201);

    expect(created.body.id).toBeDefined();
    expect(created.body.coordinates).toEqual({ lat: 40.42, lon: -3.7 });

    const after = await request(http)
      .get('/api/products/search')
      .query({ q: 'zeppelin' })
      .expect(200);
    expect(after.body.meta.total).toBe(1);
    expect(after.body.data[0].name).toBe('Quantum Zeppelin Gadget');
  });

  it('rejects an invalid body', async () => {
    await request(http)
      .post('/api/products')
      .send({ description: 'missing everything else' })
      .expect(400);
  });

  it('rejects latitude without longitude', async () => {
    await request(http)
      .post('/api/products')
      .send({
        name: 'Broken Geo Gadget',
        description: 'Half a coordinate',
        category: 'Electronics',
        subcategories: ['Wearables'],
        location: 'Madrid',
        latitude: 40.42,
        price: 10,
      })
      .expect(400);
  });

  it('rejects out of range coordinates', async () => {
    await request(http)
      .post('/api/products')
      .send({
        name: 'Off The Map Gadget',
        description: 'Latitude beyond the pole',
        category: 'Electronics',
        subcategories: ['Wearables'],
        location: 'Madrid',
        latitude: 91,
        longitude: 0,
        price: 10,
      })
      .expect(400);
  });

  describe('product lifecycle', () => {
    async function createProduct(name: string): Promise<string> {
      const res = await request(http)
        .post('/api/products')
        .send({
          name,
          description: 'lifecycle fixture',
          category: 'Electronics',
          subcategories: ['Wearables'],
          location: 'Madrid',
          price: 50,
        })
        .expect(201);
      return res.body.id as string;
    }

    it('updates a product and the change is searchable immediately', async () => {
      const id = await createProduct('Falcon Widget');

      await request(http)
        .put(`/api/products/${id}`)
        .send({
          name: 'Falcon Widget Renamed',
          description: 'lifecycle fixture',
          category: 'Electronics',
          subcategories: ['Wearables'],
          location: 'Barcelona',
          price: 75,
        })
        .expect(200);

      const found = await request(http)
        .get('/api/products/search')
        .query({ q: 'falcon widget renamed' })
        .expect(200);
      expect(found.body.data[0].name).toBe('Falcon Widget Renamed');
      expect(found.body.data[0].location).toBe('Barcelona');
    });

    it('deletes a product and it disappears from search immediately', async () => {
      const id = await createProduct('Osprey Widget');

      await request(http).delete(`/api/products/${id}`).expect(204);

      const found = await request(http)
        .get('/api/products/search')
        .query({ q: 'osprey widget' })
        .expect(200);
      expect(found.body.data.some((hit: { id: string }) => hit.id === id)).toBe(false);
    });

    it('records views and popularity feeds sorting', async () => {
      const id = await createProduct('Heron Widget');

      const first = await request(http).post(`/api/products/${id}/view`).expect(201);
      const second = await request(http).post(`/api/products/${id}/view`).expect(201);
      expect(second.body.popularity).toBe(first.body.popularity + 1);
    });

    it('returns 404 for a missing product and 400 for a malformed id', async () => {
      await request(http).delete('/api/products/00000000-0000-4000-8000-000000000000').expect(404);
      await request(http)
        .post('/api/products/00000000-0000-4000-8000-000000000000/view')
        .expect(404);
      await request(http).delete('/api/products/not-a-uuid').expect(400);
    });
  });
});

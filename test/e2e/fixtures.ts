import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { REDIS_CLIENT } from '@/products/infrastructure/cache/redis-cache.adapter';
import { ReindexProductsUseCase } from '@/products/application/use-cases/reindex-products.use-case';

const MADRID = { lat: 40.4168, lon: -3.7038 };
const BARCELONA = { lat: 41.3874, lon: 2.1686 };
const LISBON = { lat: 38.7223, lon: -9.1393 };

interface FixtureProduct {
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  latitude: number;
  longitude: number;
  price: number;
  popularity: number;
  createdAt: Date;
}

function product(overrides: Partial<FixtureProduct> & { name: string }): FixtureProduct {
  return {
    description: 'A well made product',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    latitude: MADRID.lat,
    longitude: MADRID.lon,
    price: 100,
    popularity: 10,
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    ...overrides,
  };
}

/**
 * Small, hand written dataset with known relationships: name vs description
 * matches for relevance, three cities with real coordinates for geo, two
 * categories for faceting and a duplicated name for autocomplete dedupe.
 */
export const FIXTURES: FixtureProduct[] = [
  product({
    name: 'Aurora Laptop',
    description: 'A fast machine for developers',
    price: 999.99,
    popularity: 500,
  }),
  product({
    name: 'Nordic Laptop',
    description: 'A light travel companion',
    price: 799.99,
    popularity: 900,
  }),
  product({
    name: 'Vertex Laptop Pro',
    description: 'Workstation grade power',
    location: 'Barcelona',
    latitude: BARCELONA.lat,
    longitude: BARCELONA.lon,
    price: 1499.99,
    popularity: 100,
  }),
  product({
    name: 'Lumen Phone',
    subcategories: ['Smartphones'],
    location: 'Barcelona',
    latitude: BARCELONA.lat,
    longitude: BARCELONA.lon,
    price: 599.99,
    popularity: 800,
  }),
  product({
    name: 'Cobalt Headphones',
    // Mentions laptop only in the description: must rank below name matches.
    description: 'Pairs instantly with any laptop or phone',
    subcategories: ['Headphones'],
    location: 'Lisbon',
    latitude: LISBON.lat,
    longitude: LISBON.lon,
    price: 199.99,
    popularity: 300,
  }),
  product({
    name: 'Summit Desk Chair',
    description: 'A comfortable chair for your laptop desk',
    category: 'Home & Kitchen',
    subcategories: ['Furniture'],
    price: 149.99,
    popularity: 50,
  }),
  product({
    name: 'Terra Cookbook',
    description: 'Recipes from around the world',
    category: 'Books',
    subcategories: ['Non Fiction'],
    location: 'Lisbon',
    latitude: LISBON.lat,
    longitude: LISBON.lon,
    price: 29.99,
    popularity: 400,
  }),
  product({
    name: 'Pulse Monitor',
    subcategories: ['Wearables'],
    price: 249.99,
    popularity: 200,
  }),
  product({
    name: 'Pulse Monitor',
    subcategories: ['Wearables'],
    location: 'Barcelona',
    latitude: BARCELONA.lat,
    longitude: BARCELONA.lon,
    price: 259.99,
    popularity: 220,
  }),
  product({
    name: 'Zephyr Tent',
    category: 'Sports & Outdoors',
    subcategories: ['Camping'],
    location: 'Lisbon',
    latitude: LISBON.lat,
    longitude: LISBON.lon,
    price: 349.99,
    popularity: 150,
  }),
];

/** Truncate, insert the fixture set, rebuild the index and flush the cache. */
export async function resetData(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const redis = app.get<Redis>(REDIS_CLIENT);
  const reindex = app.get(ReindexProductsUseCase);

  await prisma.outboxEntry.deleteMany();
  await prisma.product.deleteMany();
  await prisma.product.createMany({
    data: FIXTURES.map((fixture) => ({ id: randomUUID(), ...fixture })),
  });
  // bulkIndex refreshes the index, so documents are searchable on return.
  await reindex.execute({ force: true });
  await redis.flushall();
}

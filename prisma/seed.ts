import 'dotenv/config';
import { createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { faker } from '@faker-js/faker';
import { BRANDS, CATEGORIES, LOCATIONS } from './taxonomy';
import { jitteredCoordinates } from './geo';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Deterministic dataset so runs are reproducible across machines.
faker.seed(42);

const PRODUCT_COUNT = Number(process.env.SEED_PRODUCT_COUNT ?? 500);

function buildProduct(): Prisma.ProductCreateManyInput {
  const category = faker.helpers.arrayElement(CATEGORIES);
  const item = faker.helpers.arrayElement(category.items);
  const brand = faker.helpers.arrayElement(BRANDS);

  // One primary subcategory plus an optional secondary one.
  const subcategories = faker.helpers.arrayElements(
    category.subcategories,
    faker.number.int({ min: 1, max: 2 }),
  );

  const location = faker.helpers.arrayElement(LOCATIONS);
  const { lat, lon } = jitteredCoordinates(location, () =>
    faker.number.float({ min: 0, max: 1 }),
  );

  return {
    name: `${brand} ${item}`,
    description: faker.commerce.productDescription(),
    category: category.name,
    subcategories,
    location,
    latitude: lat,
    longitude: lon,
    price: new Prisma.Decimal(faker.commerce.price({ min: 5, max: 2000, dec: 2 })),
    // Skewed popularity so relevance vs popularity sorting differ visibly.
    popularity: faker.number.int({ min: 0, max: 1000 }),
    createdAt: faker.date.between({ from: '2023-01-01', to: '2025-06-30' }),
  };
}

/**
 * Deterministic value in [0, 1) derived from the row id, so backfilled
 * coordinates are stable across reruns without touching the faker stream.
 */
function hashRand(id: string): () => number {
  const digest = createHash('sha1').update(id).digest();
  let offset = 0;
  return () => digest.readUInt16BE((offset++ % 9) * 2) / 65536;
}

/**
 * Rows created before geo search have no coordinates. Fill them in place so an
 * existing Docker volume upgrades with a plain "docker compose up".
 */
async function backfillCoordinates(): Promise<void> {
  const missing = await prisma.product.findMany({
    where: { latitude: null },
    select: { id: true, location: true },
  });
  if (missing.length === 0) {
    return;
  }

  console.log(`Backfilling coordinates for ${missing.length} products...`);
  const chunkSize = 100;
  for (let start = 0; start < missing.length; start += chunkSize) {
    const chunk = missing.slice(start, start + chunkSize);
    await prisma.$transaction(
      chunk.map((row) => {
        const { lat, lon } = jitteredCoordinates(row.location, hashRand(row.id));
        return prisma.product.update({
          where: { id: row.id },
          data: { latitude: lat, longitude: lon },
        });
      }),
    );
  }
  console.log('Coordinate backfill complete.');
}

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0 && process.env.SEED_FORCE !== 'true') {
    console.log(`Skipping seed: ${existing} products already present (set SEED_FORCE=true to reseed).`);
    await backfillCoordinates();
    return;
  }

  console.log(`Seeding ${PRODUCT_COUNT} products...`);

  await prisma.product.deleteMany();

  const batchSize = 500;
  for (let start = 0; start < PRODUCT_COUNT; start += batchSize) {
    const size = Math.min(batchSize, PRODUCT_COUNT - start);
    const batch = Array.from({ length: size }, buildProduct);
    await prisma.product.createMany({ data: batch });
    console.log(`  inserted ${Math.min(start + size, PRODUCT_COUNT)}/${PRODUCT_COUNT}`);
  }

  const total = await prisma.product.count();
  console.log(`Done. ${total} products in Postgres.`);
  console.log('Run "npm run search:reindex" to project them into Elasticsearch.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

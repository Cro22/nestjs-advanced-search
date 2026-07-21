import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { faker } from '@faker-js/faker';
import { BRANDS, CATEGORIES, LOCATIONS } from './taxonomy';

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

  return {
    name: `${brand} ${item}`,
    description: faker.commerce.productDescription(),
    category: category.name,
    subcategories,
    location: faker.helpers.arrayElement(LOCATIONS),
    price: new Prisma.Decimal(faker.commerce.price({ min: 5, max: 2000, dec: 2 })),
    // Skewed popularity so relevance vs popularity sorting differ visibly.
    popularity: faker.number.int({ min: 0, max: 1000 }),
    createdAt: faker.date.between({ from: '2023-01-01', to: '2025-06-30' }),
  };
}

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0 && process.env.SEED_FORCE !== 'true') {
    console.log(`Skipping seed: ${existing} products already present (set SEED_FORCE=true to reseed).`);
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

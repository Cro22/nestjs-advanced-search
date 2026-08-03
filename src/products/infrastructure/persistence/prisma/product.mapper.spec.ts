import { Prisma, Product as PrismaProduct } from '@prisma/client';
import { ProductMapper } from '@/products/infrastructure/persistence/prisma/product.mapper';
import { Product } from '@/products/domain/product';

function row(overrides: Partial<PrismaProduct> = {}): PrismaProduct {
  return {
    id: 'c0a80121-7ac0-4e1c-9a5a-3f1c2b4d5e6f',
    name: 'Aurora Laptop',
    description: 'A fast laptop',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    latitude: 40.4168,
    longitude: -3.7038,
    price: new Prisma.Decimal('999.99'),
    popularity: 10,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ProductMapper', () => {
  it('maps a row with coordinates into the domain and back', () => {
    const product = ProductMapper.toDomain(row());
    expect(product.coordinates).toEqual({ lat: 40.4168, lon: -3.7038 });
    expect(product.price.toDecimal()).toBe(999.99);

    const persisted = ProductMapper.toPersistence(product);
    expect(persisted.latitude).toBe(40.4168);
    expect(persisted.longitude).toBe(-3.7038);
    expect(persisted.price).toBe(999.99);
  });

  it('maps a row without coordinates as undefined and persists nulls', () => {
    const product = ProductMapper.toDomain(row({ latitude: null, longitude: null }));
    expect(product.coordinates).toBeUndefined();

    const persisted = ProductMapper.toPersistence(product);
    expect(persisted.latitude).toBeNull();
    expect(persisted.longitude).toBeNull();
  });

  it('treats a half present coordinate pair as missing', () => {
    const product = ProductMapper.toDomain(row({ longitude: null }));
    expect(product.coordinates).toBeUndefined();
  });

  it('persists explicit coordinates from the domain', () => {
    const product = Product.create({
      id: '1',
      name: 'Nordic Tent',
      description: 'A tent',
      category: 'Sports & Outdoors',
      subcategories: ['Camping'],
      location: 'Bilbao',
      coordinates: { lat: 43.263, lon: -2.935 },
      price: 100,
      popularity: 5,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const persisted = ProductMapper.toPersistence(product);
    expect(persisted.latitude).toBe(43.263);
    expect(persisted.longitude).toBe(-2.935);
  });
});

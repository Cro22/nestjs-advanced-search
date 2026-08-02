import { Product, ProductProps } from '@/products/domain/product';

function props(overrides: Partial<ProductProps> = {}): ProductProps {
  return {
    id: '1',
    name: 'Laptop',
    description: 'A fast laptop',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    price: 999.99,
    popularity: 10,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Product.create', () => {
  it('builds a product from valid props', () => {
    const product = Product.create(props());
    expect(product.name).toBe('Laptop');
    expect(product.price).toBe(999.99);
  });

  it('rejects a blank name', () => {
    expect(() => Product.create(props({ name: '   ' }))).toThrow('Product name is required');
  });

  it('rejects a negative price', () => {
    expect(() => Product.create(props({ price: -1 }))).toThrow('Product price cannot be negative');
  });

  it('defaults subcategories and popularity when missing', () => {
    const product = Product.create(
      props({
        subcategories: undefined as unknown as string[],
        popularity: undefined as unknown as number,
      }),
    );
    expect(product.subcategories).toEqual([]);
    expect(product.popularity).toBe(0);
  });

  it('round trips through primitives', () => {
    const original = props();
    expect(Product.create(original).toPrimitives()).toEqual(original);
  });

  it('is not affected by mutating the source props after construction', () => {
    const source = props({ subcategories: ['Laptops'], coordinates: { lat: 40, lon: -3 } });
    const createdAtMs = source.createdAt.getTime();
    const product = Product.create(source);

    source.subcategories.push('Tampered');
    source.coordinates!.lat = 0;
    source.createdAt.setFullYear(1999);

    expect(product.subcategories).toEqual(['Laptops']);
    expect(product.coordinates).toEqual({ lat: 40, lon: -3 });
    expect(product.createdAt.getTime()).toBe(createdAtMs);
  });

  it('does not expose internal state through toPrimitives', () => {
    const product = Product.create(props({ subcategories: ['Laptops'] }));
    const snapshot = product.toPrimitives();

    snapshot.subcategories.push('Tampered');
    snapshot.coordinates && (snapshot.coordinates.lat = 0);

    expect(product.subcategories).toEqual(['Laptops']);
  });

  it('accepts valid coordinates', () => {
    const product = Product.create(props({ coordinates: { lat: 40.4168, lon: -3.7038 } }));
    expect(product.coordinates).toEqual({ lat: 40.4168, lon: -3.7038 });
  });

  it('accepts a product without coordinates', () => {
    const product = Product.create(props());
    expect(product.coordinates).toBeUndefined();
  });

  it.each([
    { lat: 91, lon: 0 },
    { lat: -91, lon: 0 },
    { lat: 0, lon: 181 },
    { lat: 0, lon: -181 },
    { lat: Number.NaN, lon: 0 },
  ])('rejects out of range coordinates %o', (coordinates) => {
    expect(() => Product.create(props({ coordinates }))).toThrow(
      'Product coordinates are out of range',
    );
  });
});

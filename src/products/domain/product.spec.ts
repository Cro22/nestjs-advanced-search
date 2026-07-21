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
      props({ subcategories: undefined as unknown as string[], popularity: undefined as unknown as number }),
    );
    expect(product.subcategories).toEqual([]);
    expect(product.popularity).toBe(0);
  });

  it('round trips through primitives', () => {
    const original = props();
    expect(Product.create(original).toPrimitives()).toEqual(original);
  });
});

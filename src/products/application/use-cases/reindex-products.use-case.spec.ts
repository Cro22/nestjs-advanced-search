import { ReindexProductsUseCase } from '@/products/application/use-cases/reindex-products.use-case';
import { ProductRepository } from '@/products/domain/ports/product.repository';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { Product } from '@/products/domain/product';

function makeProduct(id: string): Product {
  return Product.create({
    id,
    name: `Product ${id}`,
    description: 'x',
    category: 'Electronics',
    subcategories: ['Laptops'],
    location: 'Madrid',
    price: 10,
    popularity: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('ReindexProductsUseCase', () => {
  let repository: jest.Mocked<ProductRepository>;
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let useCase: ReindexProductsUseCase;

  beforeEach(() => {
    repository = {
      count: jest.fn(),
      findBatch: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;

    searchIndex = {
      countDocuments: jest.fn(),
      recreateIndex: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      index: jest.fn(),
      search: jest.fn(),
      autocomplete: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;

    useCase = new ReindexProductsUseCase(repository, searchIndex);
  });

  it('skips the rebuild when the index already matches Postgres', async () => {
    repository.count.mockResolvedValue(500);
    searchIndex.countDocuments.mockResolvedValue(500);

    const result = await useCase.execute();

    expect(result).toEqual({ indexed: 500, skipped: true });
    expect(searchIndex.recreateIndex).not.toHaveBeenCalled();
    expect(searchIndex.bulkIndex).not.toHaveBeenCalled();
  });

  it('reindexes when the index is out of sync', async () => {
    repository.count.mockResolvedValue(2);
    searchIndex.countDocuments.mockResolvedValue(0);
    repository.findBatch.mockResolvedValueOnce({
      items: [makeProduct('1'), makeProduct('2')],
      nextCursor: null,
    });

    const result = await useCase.execute();

    expect(result.skipped).toBe(false);
    expect(result.indexed).toBe(2);
    expect(searchIndex.recreateIndex).toHaveBeenCalledTimes(1);
    expect(searchIndex.bulkIndex).toHaveBeenCalledTimes(1);
  });

  it('rebuilds even when in sync if forced', async () => {
    repository.count.mockResolvedValue(1);
    searchIndex.countDocuments.mockResolvedValue(1);
    repository.findBatch.mockResolvedValueOnce({ items: [makeProduct('1')], nextCursor: null });

    const result = await useCase.execute({ force: true });

    expect(result.skipped).toBe(false);
    // The in sync short circuit must not even look at the index count when forced.
    expect(searchIndex.countDocuments).not.toHaveBeenCalled();
    expect(searchIndex.recreateIndex).toHaveBeenCalledTimes(1);
  });

  it('reindexes an empty database (count 0) rather than skipping', async () => {
    repository.count.mockResolvedValue(0);
    searchIndex.countDocuments.mockResolvedValue(0);
    repository.findBatch.mockResolvedValueOnce({ items: [], nextCursor: null });

    const result = await useCase.execute();

    // total 0 is not treated as in sync, so the index is still recreated clean.
    expect(result.skipped).toBe(false);
    expect(searchIndex.recreateIndex).toHaveBeenCalledTimes(1);
  });
});

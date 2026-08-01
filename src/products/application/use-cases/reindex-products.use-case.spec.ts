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
      contentChecksum: jest.fn().mockResolvedValue('abc'),
      findBatch: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;

    searchIndex = {
      countDocuments: jest.fn(),
      isCurrentSchema: jest.fn().mockResolvedValue(true),
      getContentChecksum: jest.fn().mockResolvedValue('abc'),
      startRebuild: jest.fn(),
      finishRebuild: jest.fn(),
      abortRebuild: jest.fn(),
      bulkIndex: jest.fn(),
      ensureIndex: jest.fn(),
      index: jest.fn(),
      remove: jest.fn(),
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
    expect(searchIndex.startRebuild).not.toHaveBeenCalled();
    expect(searchIndex.bulkIndex).not.toHaveBeenCalled();
  });

  it('rebuilds and restamps when counts match but the content checksum drifted', async () => {
    repository.count.mockResolvedValue(500);
    repository.contentChecksum.mockResolvedValue('fresh');
    searchIndex.countDocuments.mockResolvedValue(500);
    searchIndex.getContentChecksum.mockResolvedValue('stale');
    repository.findBatch.mockResolvedValueOnce({ items: [makeProduct('1')], nextCursor: null });

    const result = await useCase.execute();

    expect(result.skipped).toBe(false);
    expect(searchIndex.startRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.finishRebuild).toHaveBeenCalledWith('fresh');
  });

  it('rebuilds when counts match but the index is on an old schema', async () => {
    repository.count.mockResolvedValue(500);
    searchIndex.countDocuments.mockResolvedValue(500);
    searchIndex.isCurrentSchema.mockResolvedValue(false);
    repository.findBatch.mockResolvedValueOnce({ items: [makeProduct('1')], nextCursor: null });

    const result = await useCase.execute();

    expect(result.skipped).toBe(false);
    expect(searchIndex.startRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.finishRebuild).toHaveBeenCalledTimes(1);
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
    expect(searchIndex.startRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.bulkIndex).toHaveBeenCalledTimes(1);
    expect(searchIndex.finishRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.abortRebuild).not.toHaveBeenCalled();
  });

  it('rebuilds even when in sync if forced', async () => {
    repository.count.mockResolvedValue(1);
    searchIndex.countDocuments.mockResolvedValue(1);
    repository.findBatch.mockResolvedValueOnce({ items: [makeProduct('1')], nextCursor: null });

    const result = await useCase.execute({ force: true });

    expect(result.skipped).toBe(false);
    // The in sync short circuit must not even look at the index count when forced.
    expect(searchIndex.countDocuments).not.toHaveBeenCalled();
    expect(searchIndex.startRebuild).toHaveBeenCalledTimes(1);
  });

  it('reindexes an empty database (count 0) rather than skipping', async () => {
    repository.count.mockResolvedValue(0);
    searchIndex.countDocuments.mockResolvedValue(0);
    repository.findBatch.mockResolvedValueOnce({ items: [], nextCursor: null });

    const result = await useCase.execute();

    // total 0 is not treated as in sync, so a clean index is still built.
    expect(result.skipped).toBe(false);
    expect(searchIndex.startRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.finishRebuild).toHaveBeenCalledTimes(1);
  });

  it('aborts the staging index when a batch fails, leaving the live one alone', async () => {
    repository.count.mockResolvedValue(2);
    searchIndex.countDocuments.mockResolvedValue(0);
    repository.findBatch.mockResolvedValueOnce({
      items: [makeProduct('1'), makeProduct('2')],
      nextCursor: null,
    });
    searchIndex.bulkIndex.mockRejectedValue(new Error('bulk exploded'));

    await expect(useCase.execute()).rejects.toThrow('bulk exploded');

    expect(searchIndex.abortRebuild).toHaveBeenCalledTimes(1);
    expect(searchIndex.finishRebuild).not.toHaveBeenCalled();
  });
});

import { RecordProductViewUseCase } from '@/products/application/use-cases/record-product-view.use-case';
import { Product } from '@/products/domain/product';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { ProductRepository } from '@/products/domain/ports/product.repository';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';

const bumped = Product.create({
  id: 'p1',
  name: 'Aurora Laptop',
  description: 'x',
  category: 'Electronics',
  subcategories: ['Laptops'],
  location: 'Madrid',
  price: 999.99,
  popularity: 43,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

describe('RecordProductViewUseCase', () => {
  let repository: jest.Mocked<ProductRepository>;
  let searchIndex: jest.Mocked<ProductSearchIndex>;
  let useCase: RecordProductViewUseCase;

  beforeEach(() => {
    repository = {
      incrementPopularity: jest.fn().mockResolvedValue(bumped),
      save: jest.fn(),
      findById: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      findBatch: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;
    searchIndex = {
      index: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<ProductSearchIndex>;
    useCase = new RecordProductViewUseCase(repository, searchIndex);
  });

  it('increments the popularity and reprojects the document', async () => {
    const product = await useCase.execute('p1');

    expect(product.popularity).toBe(43);
    expect(repository.incrementPopularity).toHaveBeenCalledWith('p1');
    expect(searchIndex.index).toHaveBeenCalledTimes(1);
  });

  it('throws ProductNotFoundError for a missing id', async () => {
    repository.incrementPopularity.mockResolvedValue(null);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(searchIndex.index).not.toHaveBeenCalled();
  });

  it('still succeeds when reindexing fails (outbox repairs it)', async () => {
    searchIndex.index.mockRejectedValue(new Error('es down'));

    const product = await useCase.execute('p1');
    expect(product.popularity).toBe(43);
  });
});

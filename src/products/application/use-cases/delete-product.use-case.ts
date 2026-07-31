import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { PRODUCT_REPOSITORY, ProductRepository } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { CACHE_PORT, CachePort } from '@/products/domain/ports/cache.port';
import { GENERATION_KEY } from '@/products/application/cache-keys';

/**
 * Removes a product from the source of truth (recording a delete outbox
 * entry), invalidates cached search pages and best effort removes the search
 * document. A failed removal is repaired by the outbox processor.
 */
@Injectable()
export class DeleteProductUseCase {
  private readonly logger = new Logger(DeleteProductUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async execute(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) {
      throw new ProductNotFoundError(id);
    }

    await this.cache.incr(GENERATION_KEY);

    try {
      await this.searchIndex.remove(id);
    } catch (error) {
      this.logger.error(
        `Product ${id} deleted but index removal failed. The outbox will repair it.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

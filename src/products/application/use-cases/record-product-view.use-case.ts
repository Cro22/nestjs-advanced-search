import { Inject, Injectable, Logger } from '@nestjs/common';
import { Product } from '@/products/domain/product';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { PRODUCT_REPOSITORY, ProductRepository } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';

/**
 * Feeds the popularity signal: each recorded view atomically increments the
 * product popularity in Postgres (with an outbox entry) and reprojects the
 * document, so popularity ranking and sorting reflect real interactions.
 *
 * Deliberately does NOT bump the cache generation: views are high frequency
 * and a ranking nudge does not justify flushing every cached page. The short
 * search cache TTL bounds how stale a ranking can be.
 */
@Injectable()
export class RecordProductViewUseCase {
  private readonly logger = new Logger(RecordProductViewUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
  ) {}

  async execute(id: string): Promise<Product> {
    const product = await this.repository.incrementPopularity(id);
    if (!product) {
      throw new ProductNotFoundError(id);
    }

    try {
      await this.searchIndex.index(product);
    } catch (error) {
      this.logger.warn(
        `View recorded for ${id} but reindexing failed. The outbox will repair it. ${
          error instanceof Error ? error.message : error
        }`,
      );
    }

    return product;
  }
}

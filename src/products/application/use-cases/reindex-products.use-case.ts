import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRODUCT_REPOSITORY, ProductRepository } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';

export interface ReindexResult {
  indexed: number;
  skipped: boolean;
}

export interface ReindexOptions {
  /** Rebuild even when the index already matches Postgres (mapping changes). */
  force?: boolean;
}

/**
 * Rebuilds the Elasticsearch projection from Postgres. Recreates the index to
 * pick up mapping changes, then streams products in batches using keyset
 * pagination so memory stays flat regardless of table size.
 *
 * The operation is idempotent: unless forced, it skips the rebuild when the
 * index already holds the same number of documents as Postgres, so restarting
 * the container does not tear down a healthy index.
 */
@Injectable()
export class ReindexProductsUseCase {
  private readonly logger = new Logger(ReindexProductsUseCase.name);
  private readonly batchSize = 500;

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
  ) {}

  async execute(options: ReindexOptions = {}): Promise<ReindexResult> {
    const total = await this.repository.count();

    if (!options.force) {
      const indexedNow = await this.searchIndex.countDocuments();
      if (total > 0 && indexedNow === total) {
        this.logger.log(`Index already in sync (${total} products), skipping reindex.`);
        return { indexed: total, skipped: true };
      }
    }

    this.logger.log(`Reindexing ${total} products...`);

    await this.searchIndex.recreateIndex();

    let cursor: string | null = null;
    let indexed = 0;

    do {
      const page = await this.repository.findBatch(cursor, this.batchSize);
      if (page.items.length > 0) {
        await this.searchIndex.bulkIndex(page.items);
        indexed += page.items.length;
        this.logger.log(`  indexed ${indexed}/${total}`);
      }
      cursor = page.nextCursor;
    } while (cursor !== null);

    this.logger.log(`Reindex complete. ${indexed} products in Elasticsearch.`);
    return { indexed, skipped: false };
  }
}

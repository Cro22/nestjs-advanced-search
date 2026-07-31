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
 * Rebuilds the Elasticsearch projection from Postgres with zero downtime:
 * batches stream into a fresh staging index (keyset pagination keeps memory
 * flat) while the live alias keeps serving, and the alias swaps atomically at
 * the end. A failure aborts the staging index and leaves the live one intact.
 *
 * The operation is idempotent: unless forced, it skips the rebuild when the
 * live index is on the current schema and already holds the same number of
 * documents as Postgres, so restarting the container does not tear down a
 * healthy index.
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
      const currentSchema = await this.searchIndex.isCurrentSchema();
      const indexedNow = await this.searchIndex.countDocuments();
      if (currentSchema && total > 0 && indexedNow === total) {
        this.logger.log(`Index already in sync (${total} products), skipping reindex.`);
        return { indexed: total, skipped: true };
      }
    }

    this.logger.log(`Reindexing ${total} products...`);

    await this.searchIndex.startRebuild();

    let indexed = 0;
    try {
      let cursor: string | null = null;
      do {
        const page = await this.repository.findBatch(cursor, this.batchSize);
        if (page.items.length > 0) {
          await this.searchIndex.bulkIndex(page.items);
          indexed += page.items.length;
          this.logger.log(`  indexed ${indexed}/${total}`);
        }
        cursor = page.nextCursor;
      } while (cursor !== null);

      await this.searchIndex.finishRebuild();
    } catch (error) {
      // The live index never saw the partial rebuild; throw the staging away.
      await this.searchIndex.abortRebuild();
      throw error;
    }

    this.logger.log(`Reindex complete. ${indexed} products in Elasticsearch.`);
    return { indexed, skipped: false };
  }
}

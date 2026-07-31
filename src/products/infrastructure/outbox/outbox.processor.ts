import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ProductMapper } from '@/products/infrastructure/persistence/prisma/product.mapper';
import { OUTBOX_DELETE } from '@/products/infrastructure/outbox/outbox.types';

/**
 * Replays unprocessed outbox entries against the search index on a fixed
 * interval. The request path still indexes synchronously for immediate
 * searchability; this processor is the guarantee behind it, repairing any
 * write that raced an Elasticsearch outage or a concurrent reindex. Replaying
 * an already indexed product is a harmless idempotent upsert.
 */
@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly pollMs: number;
  private readonly batchSize = 100;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.pollMs = config.get<number>('outbox.pollMs', 5000);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.drain();
    }, this.pollMs);
    // Never keep the process alive just to poll; CLI contexts exit cleanly.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Process one batch of pending entries. Exposed for tests and manual runs. */
  async drain(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const pending = await this.prisma.outboxEntry.findMany({
        where: { processedAt: null },
        orderBy: { createdAt: 'asc' },
        take: this.batchSize,
      });

      let processed = 0;
      for (const entry of pending) {
        try {
          await this.apply(entry.productId, entry.operation);
          await this.prisma.outboxEntry.update({
            where: { id: entry.id },
            data: { processedAt: new Date(), attempts: { increment: 1 } },
          });
          processed += 1;
        } catch (error) {
          await this.prisma.outboxEntry.update({
            where: { id: entry.id },
            data: { attempts: { increment: 1 } },
          });
          this.logger.warn(
            `Outbox entry ${entry.id} (${entry.operation} ${entry.productId}) failed, will retry: ${
              error instanceof Error ? error.message : error
            }`,
          );
        }
      }
      if (processed > 0) {
        this.logger.log(`Outbox drained ${processed} entries`);
      }
      if (this.metrics) {
        const stillPending = await this.prisma.outboxEntry.count({
          where: { processedAt: null },
        });
        this.metrics.outboxPending.set(stillPending);
      }
      return processed;
    } catch (error) {
      this.logger.warn(`Outbox poll failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async apply(productId: string, operation: string): Promise<void> {
    if (operation === OUTBOX_DELETE) {
      await this.searchIndex.remove(productId);
      return;
    }
    const row = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!row) {
      // Deleted after the upsert was queued; the delete entry handles the index.
      return;
    }
    await this.searchIndex.index(ProductMapper.toDomain(row));
  }
}

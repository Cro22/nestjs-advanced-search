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

/** A batch entry claimed for this worker by the SKIP LOCKED query. */
interface ClaimedEntry {
  id: string;
  productId: string;
  operation: string;
  /** Attempt count after this claim incremented it (1 on the first try). */
  attempts: number;
}

const MAX_ERROR_LENGTH = 500;

/**
 * Replays unprocessed outbox entries against the search index on a fixed
 * interval. The request path still indexes synchronously for immediate
 * searchability; this processor is the guarantee behind it, repairing any write
 * that raced an Elasticsearch outage or a concurrent reindex. Replaying an
 * already indexed product is a harmless idempotent upsert.
 *
 * Entries are claimed with `FOR UPDATE SKIP LOCKED`, so any number of replicas
 * can run this processor without two of them grabbing the same entry. A claim
 * stamps a short lock horizon on the row (`nextRetryAt`); if the worker dies
 * mid-flight the entry becomes eligible again once the horizon passes. Failures
 * back off exponentially and, once they exhaust `maxAttempts`, the entry is
 * dead-lettered (`failedAt`) rather than retried forever.
 */
@Injectable()
export class OutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly pollMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly lockMs: number;
  private readonly retentionMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.pollMs = config.get<number>('outbox.pollMs', 5000);
    this.batchSize = config.get<number>('outbox.batchSize', 100);
    this.maxAttempts = config.get<number>('outbox.maxAttempts', 10);
    this.backoffBaseMs = config.get<number>('outbox.backoffBaseMs', 1000);
    this.backoffMaxMs = config.get<number>('outbox.backoffMaxMs', 60000);
    this.lockMs = config.get<number>('outbox.lockMs', 60000);
    this.retentionMs = config.get<number>('outbox.retentionMs', 604800000);
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

  /** Process one batch of claimed entries. Exposed for tests and manual runs. */
  async drain(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const claimed = await this.claimBatch();

      let processed = 0;
      for (const entry of claimed) {
        try {
          await this.apply(entry.productId, entry.operation);
          await this.markProcessed(entry.id);
          processed += 1;
        } catch (error) {
          await this.markFailure(entry, error);
        }
      }
      if (processed > 0) {
        this.logger.log(`Outbox drained ${processed} entries`);
      }

      await this.cleanup();
      await this.updateMetrics();
      return processed;
    } catch (error) {
      this.logger.warn(`Outbox poll failed: ${error instanceof Error ? error.message : error}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Atomically claim a batch: lock a page of eligible rows with SKIP LOCKED so
   * concurrent workers never collide, bump their attempt count and stamp a lock
   * horizon. Returning the rows in the same statement means no separate read is
   * needed and no row is visible to another worker while this one holds it.
   */
  private async claimBatch(): Promise<ClaimedEntry[]> {
    const lockHorizon = new Date(Date.now() + this.lockMs);
    return this.prisma.$queryRaw<ClaimedEntry[]>`
      UPDATE outbox_entries
      SET attempts = attempts + 1, next_retry_at = ${lockHorizon}
      WHERE id IN (
        SELECT id FROM outbox_entries
        WHERE processed_at IS NULL
          AND failed_at IS NULL
          AND (next_retry_at IS NULL OR next_retry_at <= NOW())
        ORDER BY created_at ASC
        LIMIT ${this.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, product_id AS "productId", operation, attempts
    `;
  }

  private async markProcessed(id: string): Promise<void> {
    await this.prisma.outboxEntry.update({
      where: { id },
      data: { processedAt: new Date(), nextRetryAt: null },
    });
  }

  /**
   * A failed entry either backs off for another try or, once it has used up its
   * attempts, is dead-lettered so a poison message never blocks the queue or
   * churns forever.
   */
  private async markFailure(entry: ClaimedEntry, error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(
      0,
      MAX_ERROR_LENGTH,
    );

    if (entry.attempts >= this.maxAttempts) {
      await this.prisma.outboxEntry.update({
        where: { id: entry.id },
        data: { failedAt: new Date(), lastError: message },
      });
      this.logger.error(
        `Outbox entry ${entry.id} (${entry.operation} ${entry.productId}) dead-lettered after ${entry.attempts} attempts: ${message}`,
      );
      return;
    }

    const delay = Math.min(this.backoffBaseMs * 2 ** (entry.attempts - 1), this.backoffMaxMs);
    await this.prisma.outboxEntry.update({
      where: { id: entry.id },
      data: { nextRetryAt: new Date(Date.now() + delay), lastError: message },
    });
    this.logger.warn(
      `Outbox entry ${entry.id} (${entry.operation} ${entry.productId}) failed (attempt ${entry.attempts}), retrying in ${delay}ms: ${message}`,
    );
  }

  /** Reclaim space by deleting a bounded page of long-processed entries. */
  private async cleanup(): Promise<void> {
    const cutoff = new Date(Date.now() - this.retentionMs);
    await this.prisma.$executeRaw`
      DELETE FROM outbox_entries
      WHERE id IN (
        SELECT id FROM outbox_entries
        WHERE processed_at IS NOT NULL AND processed_at < ${cutoff}
        LIMIT 1000
      )
    `;
  }

  private async updateMetrics(): Promise<void> {
    if (!this.metrics) {
      return;
    }
    const [pending, deadLettered] = await Promise.all([
      this.prisma.outboxEntry.count({ where: { processedAt: null, failedAt: null } }),
      this.prisma.outboxEntry.count({ where: { failedAt: { not: null } } }),
    ]);
    this.metrics.outboxPending.set(pending);
    this.metrics.outboxDeadLettered.set(deadLettered);
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

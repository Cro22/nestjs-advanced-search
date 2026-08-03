import { Client, errors, estypes } from '@elastic/elasticsearch';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@/products/domain/product';
import { SEARCH_SCHEMA_VERSION } from '@/products/domain/search/search-version';
import { PRODUCT_INDEX_SETTINGS, toDocument } from '@/products/infrastructure/search/product-index';

/**
 * Owns the physical index lifecycle behind the stable read alias: creation, the
 * zero downtime rebuild protocol (staging index + atomic alias swap + checksum
 * stamping), schema-version detection, and the document writes that fill the
 * index. The search adapter delegates all of this here so it can focus on
 * turning queries and responses into domain types.
 */
export class EsIndexManager {
  private readonly logger = new Logger(EsIndexManager.name);
  /** Alias every read and live write goes through. */
  readonly aliasName: string;
  /** Prefix of the physical indices for the current schema version. */
  private readonly physicalPrefix: string;
  /** Physical staging index while a rebuild is in flight, else null. */
  private stagingIndex: string | null = null;

  constructor(
    private readonly client: Client,
    config: ConfigService,
  ) {
    // Reads target a stable alias while writes during a rebuild go to a fresh
    // physical index named {alias}_v{schema}_{timestamp}. Swapping the alias at
    // the end makes reindexing invisible to searchers, and the embedded schema
    // version lets the boot reindex detect a mapping change.
    this.aliasName = config.get<string>('elasticsearch.index', 'products');
    this.physicalPrefix = `${this.aliasName}_v${SEARCH_SCHEMA_VERSION}`;
  }

  private newPhysicalName(): string {
    return `${this.physicalPrefix}_${Date.now()}`;
  }

  async ensureIndex(): Promise<void> {
    const aliasExists = await this.client.indices.existsAlias({ name: this.aliasName });
    if (aliasExists) {
      return;
    }
    // A concrete index squatting on the alias name (a volume from before the
    // alias strategy) is dropped: Postgres is the source of truth and the boot
    // reindex rebuilds the projection right after.
    const bareIndex = await this.client.indices.exists({ index: this.aliasName });
    if (bareIndex) {
      await this.client.indices.delete({ index: this.aliasName });
      this.logger.log(`Deleted legacy index "${this.aliasName}" to free the alias name`);
    }
    const physical = this.newPhysicalName();
    await this.createIndex(physical);
    await this.client.indices.putAlias({ index: physical, name: this.aliasName });
    this.logger.log(`Created index "${physical}" behind alias "${this.aliasName}"`);
  }

  async startRebuild(): Promise<void> {
    this.stagingIndex = this.newPhysicalName();
    await this.createIndex(this.stagingIndex);
    this.logger.log(`Staging rebuild into "${this.stagingIndex}"`);
  }

  async finishRebuild(checksum?: string): Promise<void> {
    if (!this.stagingIndex) {
      throw new Error('finishRebuild called without startRebuild');
    }
    const staging = this.stagingIndex;

    // Stamp the freshly built index with the content checksum before the swap,
    // so the atomic alias move exposes both the data and its fingerprint at once
    // and a later boot can tell whether the projection still matches Postgres.
    if (checksum !== undefined) {
      await this.client.indices.putMapping({
        index: staging,
        _meta: { contentChecksum: checksum },
      } as unknown as estypes.IndicesPutMappingRequest);
    }

    // A leftover concrete index on the alias name would make the alias add fail;
    // clear it before the swap (same legacy case as ensureIndex).
    const aliasExists = await this.client.indices.existsAlias({ name: this.aliasName });
    if (!aliasExists) {
      const bareIndex = await this.client.indices.exists({ index: this.aliasName });
      if (bareIndex) {
        await this.client.indices.delete({ index: this.aliasName });
      }
    }

    // One atomic action set: readers never observe a missing alias.
    await this.client.indices.updateAliases({
      actions: [
        ...(aliasExists
          ? [{ remove: { index: `${this.aliasName}_v*`, alias: this.aliasName } }]
          : []),
        { add: { index: staging, alias: this.aliasName } },
      ],
    });
    this.stagingIndex = null;
    this.logger.log(`Alias "${this.aliasName}" now points at "${staging}"`);
    await this.deleteStalePhysicals(staging);
  }

  async abortRebuild(): Promise<void> {
    if (!this.stagingIndex) {
      return;
    }
    const staging = this.stagingIndex;
    this.stagingIndex = null;
    try {
      await this.client.indices.delete({ index: staging });
      this.logger.warn(`Rebuild aborted, deleted staging index "${staging}"`);
    } catch (error) {
      this.logger.warn(
        `Could not delete staging index "${staging}": ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  async isCurrentSchema(): Promise<boolean> {
    try {
      const aliasExists = await this.client.indices.existsAlias({ name: this.aliasName });
      if (!aliasExists) {
        return false;
      }
      const resolved = await this.client.indices.getAlias({ name: this.aliasName });
      return Object.keys(resolved).some((name) => name.startsWith(`${this.physicalPrefix}_`));
    } catch {
      return false;
    }
  }

  async getContentChecksum(): Promise<string | null> {
    try {
      const aliasExists = await this.client.indices.existsAlias({ name: this.aliasName });
      if (!aliasExists) {
        return null;
      }
      const mapping = await this.client.indices.getMapping({ index: this.aliasName });
      // Keyed by the physical index behind the alias; read the one _meta stamp.
      const meta = Object.values(mapping)[0]?.mappings?._meta as
        { contentChecksum?: string } | undefined;
      return meta?.contentChecksum ?? null;
    } catch {
      return null;
    }
  }

  async countDocuments(): Promise<number> {
    const aliasExists = await this.client.indices.existsAlias({ name: this.aliasName });
    if (!aliasExists) {
      return 0;
    }
    const response = await this.client.count({ index: this.aliasName });
    return response.count ?? 0;
  }

  async index(product: Product): Promise<void> {
    await this.client.index({
      index: this.aliasName,
      id: product.id,
      document: toDocument(product),
      // wait_for so a product created through the API is searchable on the very
      // next request, keeping the write path consistent for the caller.
      refresh: 'wait_for',
    });
    // During an in process rebuild, mirror the write into the staging index so it
    // survives the alias swap. A rebuild running in another process cannot see
    // this write; the outbox processor repairs that window.
    if (this.stagingIndex) {
      await this.client.index({
        index: this.stagingIndex,
        id: product.id,
        document: toDocument(product),
      });
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.client.delete({
        index: this.aliasName,
        id: productId,
        refresh: 'wait_for',
      });
    } catch (error) {
      // Deleting an already absent document is success, not failure.
      if (!(error instanceof errors.ResponseError && error.statusCode === 404)) {
        throw error;
      }
    }
  }

  async bulkIndex(products: Product[]): Promise<void> {
    if (products.length === 0) {
      return;
    }
    // While a rebuild is staging, batches fill the staging index; the live alias
    // keeps serving the previous generation untouched.
    const target = this.stagingIndex ?? this.aliasName;
    const operations = products.flatMap((product) => [
      { index: { _index: target, _id: product.id } },
      toDocument(product),
    ]);

    // refresh: true forces an immediate index refresh, which is expensive. It is
    // acceptable here because bulk indexing only runs at seed and reindex time,
    // never on the request path.
    const response = await this.client.bulk({ operations, refresh: true });
    if (response.errors) {
      const firstError = response.items.find((item) => item.index?.error)?.index?.error;
      throw new Error(`Bulk indexing failed: ${JSON.stringify(firstError)}`);
    }
  }

  private async createIndex(physicalName: string): Promise<void> {
    await this.client.indices.create({
      index: physicalName,
      ...PRODUCT_INDEX_SETTINGS,
    } as unknown as estypes.IndicesCreateRequest);
  }

  /** Best effort removal of physical indices no longer behind the alias. */
  private async deleteStalePhysicals(current: string): Promise<void> {
    try {
      const existing = await this.client.indices.get({
        index: `${this.aliasName}_v*`,
        ignore_unavailable: true,
      });
      const stale = Object.keys(existing).filter((name) => name !== current);
      for (const name of stale) {
        await this.client.indices.delete({ index: name });
        this.logger.log(`Deleted stale index "${name}"`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not clean up stale indices: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

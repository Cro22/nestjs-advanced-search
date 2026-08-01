import { Client, errors, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';
import { Product } from '@/products/domain/product';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { ProductSearchCriteria, SortField } from '@/products/domain/search/search-criteria';
import {
  FacetBucket,
  HitHighlights,
  PriceStats,
  ProductSearchResult,
  ProductView,
} from '@/products/domain/search/search-result';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';
import { SEARCH_SCHEMA_VERSION } from '@/products/domain/search/search-version';
import { ELASTICSEARCH_CLIENT } from '@/products/infrastructure/search/elasticsearch.client';
import { EsQueryBuilder } from '@/products/infrastructure/search/es-query.builder';
import {
  PRODUCT_INDEX_SETTINGS,
  ProductDocument,
  toDocument,
} from '@/products/infrastructure/search/product-index';

/**
 * Minimal shapes for the parts of the Elasticsearch response we read. The
 * client types aggregations and suggesters as broad unions, so we narrow them to
 * exactly the fields our query produces instead of reaching for `any`.
 */
interface TermsBucket {
  key: string;
  doc_count: number;
}

interface FilteredTermsAgg {
  values: { buckets: TermsBucket[] };
}

interface FilteredStatsAgg {
  values: { count: number; min: number | null; max: number | null; avg: number };
}

interface ProductAggregations {
  categories: FilteredTermsAgg;
  subcategories: FilteredTermsAgg;
  locations: FilteredTermsAgg;
  price_stats: FilteredStatsAgg;
}

type FacetKey = 'categories' | 'subcategories' | 'locations';

interface PhraseSuggestOption {
  text: string;
}

interface ProductSuggest {
  alternatives: Array<{ options: PhraseSuggestOption[] }>;
}

@Injectable()
export class EsProductSearchAdapter implements ProductSearchIndex {
  private readonly logger = new Logger(EsProductSearchAdapter.name);
  /** Alias every read and live write goes through. */
  private readonly aliasName: string;
  /** Prefix of the physical indices for the current schema version. */
  private readonly physicalPrefix: string;
  /** Physical staging index while a rebuild is in flight, else null. */
  private stagingIndex: string | null = null;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    // Reads target a stable alias while writes during a rebuild go to a fresh
    // physical index named {alias}_v{schema}_{timestamp}. Swapping the alias
    // at the end makes reindexing invisible to searchers, and the embedded
    // schema version lets the boot reindex detect a mapping change.
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
    // alias strategy) is dropped: Postgres is the source of truth and the
    // boot reindex rebuilds the projection right after.
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

    // A leftover concrete index on the alias name would make the alias add
    // fail; clear it before the swap (same legacy case as ensureIndex).
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
    // During an in process rebuild, mirror the write into the staging index so
    // it survives the alias swap. A rebuild running in another process cannot
    // see this write; the outbox processor repairs that window.
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
    // While a rebuild is staging, batches fill the staging index; the live
    // alias keeps serving the previous generation untouched.
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

  async search(criteria: ProductSearchCriteria): Promise<ProductSearchResult> {
    const request = {
      index: this.aliasName,
      ...EsQueryBuilder.buildSearchBody(criteria),
    } as unknown as estypes.SearchRequest;

    let response: estypes.SearchResponse<ProductDocument>;
    try {
      response = await this.client.search<ProductDocument>(request);
    } catch (error) {
      throw this.mapError('search', error);
    }

    const withDistance = criteria.sort.field === SortField.DISTANCE;
    const hits = (response.hits.hits ?? []).map((hit) => {
      const highlights = this.readHighlights(hit.highlight);
      const distanceKm = withDistance ? this.readDistance(hit.sort) : undefined;
      return {
        product: this.toView(hit._source as ProductDocument),
        score: hit._score ?? 0,
        ...(highlights ? { highlights } : {}),
        ...(distanceKm !== undefined ? { distanceKm } : {}),
      };
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    const aggregations = response.aggregations as unknown as ProductAggregations | undefined;
    const suggest = response.suggest as unknown as ProductSuggest | undefined;

    return {
      hits,
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      facets: {
        categories: this.readBuckets(aggregations, 'categories'),
        subcategories: this.readBuckets(aggregations, 'subcategories'),
        locations: this.readBuckets(aggregations, 'locations'),
        price: this.readPriceStats(aggregations),
      },
      suggestions: this.readSuggestions(suggest, criteria.text),
    };
  }

  async autocomplete(prefix: string, limit: number): Promise<string[]> {
    const request = {
      index: this.aliasName,
      ...EsQueryBuilder.buildAutocompleteBody(prefix, limit),
    } as unknown as estypes.SearchRequest;

    let response: estypes.SearchResponse<ProductDocument>;
    try {
      response = await this.client.search<ProductDocument>(request);
    } catch (error) {
      throw this.mapError('autocomplete', error);
    }

    return (response.hits.hits ?? [])
      .map((hit) => (hit._source as ProductDocument)?.name)
      .filter((name): name is string => Boolean(name));
  }

  // --- helpers -------------------------------------------------------------

  private async createIndex(physicalName: string): Promise<void> {
    await this.client.indices.create({
      index: physicalName,
      ...PRODUCT_INDEX_SETTINGS,
    } as unknown as estypes.IndicesCreateRequest);
  }

  /**
   * Log the raw failure and surface a clean domain error. A 400 class response
   * means the request itself was rejected (client mistake, reported as such);
   * anything else (connectivity, timeouts, 429, 5xx) is a backend outage.
   */
  private mapError(operation: string, error: unknown): Error {
    this.logger.error(
      `Elasticsearch ${operation} failed`,
      error instanceof Error ? error.stack : String(error),
    );
    if (error instanceof errors.ResponseError && error.statusCode === 400) {
      this.metrics?.searchErrors.inc({ operation, kind: 'invalid_query' });
      return new InvalidSearchQueryError();
    }
    this.metrics?.searchErrors.inc({ operation, kind: 'unavailable' });
    return new SearchUnavailableError();
  }

  private readHighlights(
    highlight: Record<string, string[]> | undefined,
  ): HitHighlights | undefined {
    const name = highlight?.name?.[0];
    const description = highlight?.description?.[0];
    if (!name && !description) {
      return undefined;
    }
    return {
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
    };
  }

  /** The first sort value of a geo distance sort is the distance in km. */
  private readDistance(sort: estypes.SortResults | undefined): number | undefined {
    const value = Number(sort?.[0]);
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return Math.round(value * 100) / 100;
  }

  private toView(source: ProductDocument): ProductView {
    return {
      id: source.id,
      name: source.name,
      description: source.description,
      category: source.category,
      subcategories: source.subcategories,
      location: source.location,
      ...(source.coordinates ? { coordinates: source.coordinates } : {}),
      price: source.price,
      popularity: source.popularity,
      createdAt: new Date(source.createdAt),
    };
  }

  private readBuckets(
    aggregations: ProductAggregations | undefined,
    facet: FacetKey,
  ): FacetBucket[] {
    const buckets = aggregations?.[facet]?.values.buckets ?? [];
    return buckets.map((bucket) => ({ value: bucket.key, count: bucket.doc_count }));
  }

  private readPriceStats(aggregations: ProductAggregations | undefined): PriceStats | null {
    const stats = aggregations?.price_stats?.values;
    if (!stats || stats.count === 0 || stats.min === null || stats.max === null) {
      return null;
    }
    return { min: stats.min, max: stats.max, avg: Math.round(stats.avg * 100) / 100 };
  }

  private readSuggestions(suggest: ProductSuggest | undefined, text?: string): string[] {
    const options = suggest?.alternatives?.[0]?.options ?? [];
    const original = text?.trim().toLowerCase();
    return options
      .map((option) => option.text)
      .filter((suggestion) => suggestion.toLowerCase() !== original);
  }
}

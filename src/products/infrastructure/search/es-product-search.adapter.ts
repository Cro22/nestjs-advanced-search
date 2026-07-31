import { Client, errors, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  private readonly baseIndexName: string;
  private readonly indexName: string;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    config: ConfigService,
  ) {
    // The physical index name embeds the schema version. Bumping the version
    // makes the count based idempotency check see an empty index, so the boot
    // time reindex rebuilds with the new mapping and no entrypoint changes.
    this.baseIndexName = config.get<string>('elasticsearch.index', 'products');
    this.indexName = `${this.baseIndexName}_v${SEARCH_SCHEMA_VERSION}`;
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      await this.createIndex();
      this.logger.log(`Created index "${this.indexName}"`);
    }
  }

  async recreateIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (exists) {
      await this.client.indices.delete({ index: this.indexName });
    }
    await this.createIndex();
    this.logger.log(`Recreated index "${this.indexName}"`);
    await this.deleteStaleGenerations();
  }

  /** Best effort removal of indices left behind by earlier schema versions. */
  private async deleteStaleGenerations(): Promise<void> {
    try {
      const existing = await this.client.indices.get({
        index: [`${this.baseIndexName}_v*`, this.baseIndexName],
        ignore_unavailable: true,
      });
      const stale = Object.keys(existing).filter((name) => name !== this.indexName);
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
    const exists = await this.client.indices.exists({ index: this.indexName });
    if (!exists) {
      return 0;
    }
    const response = await this.client.count({ index: this.indexName });
    return response.count ?? 0;
  }

  async index(product: Product): Promise<void> {
    await this.client.index({
      index: this.indexName,
      id: product.id,
      document: toDocument(product),
      // wait_for so a product created through the API is searchable on the very
      // next request, keeping the write path consistent for the caller.
      refresh: 'wait_for',
    });
  }

  async bulkIndex(products: Product[]): Promise<void> {
    if (products.length === 0) {
      return;
    }
    const operations = products.flatMap((product) => [
      { index: { _index: this.indexName, _id: product.id } },
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
      index: this.indexName,
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
      index: this.indexName,
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

  private async createIndex(): Promise<void> {
    await this.client.indices.create({
      index: this.indexName,
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
      return new InvalidSearchQueryError();
    }
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

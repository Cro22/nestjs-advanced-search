import { Client, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@/products/domain/product';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { ProductSearchCriteria } from '@/products/domain/search/search-criteria';
import {
  FacetBucket,
  PriceStats,
  ProductSearchResult,
  ProductView,
} from '@/products/domain/search/search-result';
import { SearchUnavailableError } from '@/products/domain/search/search.errors';
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
  private readonly indexName: string;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    config: ConfigService,
  ) {
    this.indexName = config.get<string>('elasticsearch.index', 'products');
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
      throw this.unavailable('search', error);
    }

    const hits = (response.hits.hits ?? []).map((hit) => ({
      product: this.toView(hit._source as ProductDocument),
      score: hit._score ?? 0,
    }));

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
      throw this.unavailable('autocomplete', error);
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

  /** Log the raw failure and surface a clean domain error to the callers. */
  private unavailable(operation: string, error: unknown): SearchUnavailableError {
    this.logger.error(
      `Elasticsearch ${operation} failed`,
      error instanceof Error ? error.stack : String(error),
    );
    return new SearchUnavailableError();
  }

  private toView(source: ProductDocument): ProductView {
    return {
      id: source.id,
      name: source.name,
      description: source.description,
      category: source.category,
      subcategories: source.subcategories,
      location: source.location,
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

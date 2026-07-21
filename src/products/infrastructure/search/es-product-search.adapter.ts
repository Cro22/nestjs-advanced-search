import { Client } from '@elastic/elasticsearch';
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
import { ELASTICSEARCH_CLIENT } from '@/products/infrastructure/search/elasticsearch.client';
import { EsQueryBuilder } from '@/products/infrastructure/search/es-query.builder';
import {
  PRODUCT_INDEX_SETTINGS,
  ProductDocument,
  toDocument,
} from '@/products/infrastructure/search/product-index';

/* eslint-disable @typescript-eslint/no-explicit-any */

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

    const response = await this.client.bulk({ operations, refresh: true });
    if (response.errors) {
      const firstError = response.items.find((item) => item.index?.error)?.index?.error;
      throw new Error(`Bulk indexing failed: ${JSON.stringify(firstError)}`);
    }
  }

  async search(criteria: ProductSearchCriteria): Promise<ProductSearchResult> {
    const body = EsQueryBuilder.buildSearchBody(criteria);
    const response = await this.client.search<ProductDocument>(body as any);

    const hits = (response.hits.hits ?? []).map((hit) => ({
      product: this.toView(hit._source as ProductDocument),
      score: hit._score ?? 0,
    }));

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    return {
      hits,
      total,
      page: criteria.page,
      pageSize: criteria.pageSize,
      facets: {
        categories: this.readBuckets(response, 'categories'),
        subcategories: this.readBuckets(response, 'subcategories'),
        locations: this.readBuckets(response, 'locations'),
        price: this.readPriceStats(response),
      },
      suggestions: this.readSuggestions(response, criteria.text),
    };
  }

  async autocomplete(prefix: string, limit: number): Promise<string[]> {
    const body = EsQueryBuilder.buildAutocompleteBody(prefix, limit);
    const response = await this.client.search<ProductDocument>({
      index: this.indexName,
      ...(body as any),
    });
    return (response.hits.hits ?? [])
      .map((hit) => (hit._source as ProductDocument)?.name)
      .filter((name): name is string => Boolean(name));
  }

  // --- helpers -------------------------------------------------------------

  private async createIndex(): Promise<void> {
    await this.client.indices.create({
      index: this.indexName,
      ...(PRODUCT_INDEX_SETTINGS as any),
    });
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

  private readBuckets(response: any, facet: string): FacetBucket[] {
    const buckets = response.aggregations?.[facet]?.values?.buckets ?? [];
    return buckets.map((bucket: any) => ({ value: bucket.key, count: bucket.doc_count }));
  }

  private readPriceStats(response: any): PriceStats | null {
    const stats = response.aggregations?.price_stats?.values;
    if (!stats || stats.count === 0 || stats.min === null) {
      return null;
    }
    return { min: stats.min, max: stats.max, avg: Math.round(stats.avg * 100) / 100 };
  }

  private readSuggestions(response: any, text?: string): string[] {
    const options = response.suggest?.alternatives?.[0]?.options ?? [];
    const original = text?.trim().toLowerCase();
    return options
      .map((option: any) => option.text as string)
      .filter((suggestion: string) => suggestion.toLowerCase() !== original);
  }
}

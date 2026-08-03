import { Client, errors, estypes } from '@elastic/elasticsearch';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';
import { Product } from '@/products/domain/product';
import { ProductSearchIndex } from '@/products/domain/ports/product-search-index.repository';
import { ProductSearchCriteria } from '@/products/domain/search/search-criteria';
import { ProductSearchResult } from '@/products/domain/search/search-result';
import {
  InvalidSearchQueryError,
  SearchUnavailableError,
} from '@/products/domain/search/search.errors';
import { ELASTICSEARCH_CLIENT } from '@/products/infrastructure/search/elasticsearch.client';
import { EsQueryBuilder } from '@/products/infrastructure/search/es-query.builder';
import { ProductDocument } from '@/products/infrastructure/search/product-index';
import { EsIndexManager } from '@/products/infrastructure/search/es-index.manager';
import {
  readAutocompleteNames,
  toSearchResult,
} from '@/products/infrastructure/search/es-response.mapper';

/**
 * Elasticsearch-backed ProductSearchIndex. This adapter owns the read side —
 * building queries and turning responses into domain types — and delegates the
 * index lifecycle and document writes to EsIndexManager, keeping each concern
 * small and independently testable.
 */
@Injectable()
export class EsProductSearchAdapter implements ProductSearchIndex {
  private readonly logger = new Logger(EsProductSearchAdapter.name);
  private readonly indexManager: EsIndexManager;
  private readonly aliasName: string;

  constructor(
    @Inject(ELASTICSEARCH_CLIENT) private readonly client: Client,
    config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.indexManager = new EsIndexManager(client, config);
    this.aliasName = this.indexManager.aliasName;
  }

  // --- index lifecycle and writes (delegated) ------------------------------

  ensureIndex(): Promise<void> {
    return this.indexManager.ensureIndex();
  }

  startRebuild(): Promise<void> {
    return this.indexManager.startRebuild();
  }

  finishRebuild(checksum?: string): Promise<void> {
    return this.indexManager.finishRebuild(checksum);
  }

  abortRebuild(): Promise<void> {
    return this.indexManager.abortRebuild();
  }

  isCurrentSchema(): Promise<boolean> {
    return this.indexManager.isCurrentSchema();
  }

  getContentChecksum(): Promise<string | null> {
    return this.indexManager.getContentChecksum();
  }

  countDocuments(): Promise<number> {
    return this.indexManager.countDocuments();
  }

  index(product: Product): Promise<void> {
    return this.indexManager.index(product);
  }

  remove(productId: string): Promise<void> {
    return this.indexManager.remove(productId);
  }

  bulkIndex(products: Product[]): Promise<void> {
    return this.indexManager.bulkIndex(products);
  }

  // --- read side -----------------------------------------------------------

  async search(criteria: ProductSearchCriteria): Promise<ProductSearchResult> {
    const request = this.toSearchRequest(EsQueryBuilder.buildSearchBody(criteria));

    let response: estypes.SearchResponse<ProductDocument>;
    try {
      response = await this.client.search<ProductDocument>(request);
    } catch (error) {
      throw this.mapError('search', error);
    }

    return toSearchResult(response, criteria);
  }

  async autocomplete(prefix: string, limit: number): Promise<string[]> {
    const request = this.toSearchRequest(EsQueryBuilder.buildAutocompleteBody(prefix, limit));

    let response: estypes.SearchResponse<ProductDocument>;
    try {
      response = await this.client.search<ProductDocument>(request);
    } catch (error) {
      throw this.mapError('autocomplete', error);
    }

    return readAutocompleteNames(response);
  }

  /**
   * The query builder returns a plain body object, which is looser than the
   * client's generated SearchRequest type. This is the single boundary where we
   * bridge the two, so the cast lives here instead of at every call site.
   */
  private toSearchRequest(body: object): estypes.SearchRequest {
    return { index: this.aliasName, ...body } as unknown as estypes.SearchRequest;
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
}

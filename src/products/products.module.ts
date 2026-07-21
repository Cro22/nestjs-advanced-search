import { Module, OnApplicationBootstrap, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PRODUCT_REPOSITORY } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { CACHE_PORT } from '@/products/domain/ports/cache.port';

import { SearchProductsUseCase } from '@/products/application/use-cases/search-products.use-case';
import { AutocompleteUseCase } from '@/products/application/use-cases/autocomplete.use-case';
import { CreateProductUseCase } from '@/products/application/use-cases/create-product.use-case';
import { ReindexProductsUseCase } from '@/products/application/use-cases/reindex-products.use-case';

import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { PrismaProductRepository } from '@/products/infrastructure/persistence/prisma/prisma-product.repository';
import {
  createElasticsearchClient,
  ELASTICSEARCH_CLIENT,
} from '@/products/infrastructure/search/elasticsearch.client';
import { EsProductSearchAdapter } from '@/products/infrastructure/search/es-product-search.adapter';
import {
  createRedisClient,
  REDIS_CLIENT,
  RedisCacheAdapter,
} from '@/products/infrastructure/cache/redis-cache.adapter';
import { ProductsController } from '@/products/infrastructure/http/products.controller';

@Module({
  controllers: [ProductsController],
  providers: [
    PrismaService,

    // Infrastructure clients
    {
      provide: ELASTICSEARCH_CLIENT,
      useFactory: createElasticsearchClient,
      inject: [ConfigService],
    },
    {
      provide: REDIS_CLIENT,
      useFactory: createRedisClient,
      inject: [ConfigService],
    },

    // Ports bound to adapters (hexagonal wiring)
    { provide: PRODUCT_REPOSITORY, useClass: PrismaProductRepository },
    { provide: PRODUCT_SEARCH_INDEX, useClass: EsProductSearchAdapter },
    { provide: CACHE_PORT, useClass: RedisCacheAdapter },

    // Use cases
    SearchProductsUseCase,
    AutocompleteUseCase,
    CreateProductUseCase,
    ReindexProductsUseCase,
  ],
  exports: [
    PrismaService,
    ELASTICSEARCH_CLIENT,
    REDIS_CLIENT,
    ReindexProductsUseCase,
    PRODUCT_SEARCH_INDEX,
  ],
})
export class ProductsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductsModule.name);

  constructor(@Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex) {}

  /** Make sure the search index exists so the API works on a cold cluster. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.searchIndex.ensureIndex();
    } catch (error) {
      this.logger.warn(
        `Could not ensure the search index at boot: ${
          error instanceof Error ? error.message : String(error)
        }. It will be created on the first reindex.`,
      );
    }
  }
}

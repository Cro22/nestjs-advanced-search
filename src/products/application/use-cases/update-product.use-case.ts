import { Inject, Injectable, Logger } from '@nestjs/common';
import { Product } from '@/products/domain/product';
import { ProductNotFoundError } from '@/products/domain/product.errors';
import { GeoPoint } from '@/products/domain/geo';
import { PRODUCT_REPOSITORY, ProductRepository } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';
import { CACHE_PORT, CachePort } from '@/products/domain/ports/cache.port';
import { GENERATION_KEY } from '@/products/application/cache-keys';

export interface UpdateProductCommand {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  coordinates?: GeoPoint;
  price: number;
  popularity?: number;
}

/**
 * Full replacement of a product. The identity and creation date are kept; the
 * popularity is kept too unless explicitly provided, so accumulated view
 * counts survive an edit. Same consistency model as the create path: Postgres
 * first (with an outbox entry), then a best effort synchronous index that the
 * outbox processor backs up.
 */
@Injectable()
export class UpdateProductUseCase {
  private readonly logger = new Logger(UpdateProductUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
    @Inject(CACHE_PORT) private readonly cache: CachePort,
  ) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const existing = await this.repository.findById(command.id);
    if (!existing) {
      throw new ProductNotFoundError(command.id);
    }

    const product = Product.create({
      id: existing.id,
      name: command.name,
      description: command.description,
      category: command.category,
      subcategories: command.subcategories,
      location: command.location,
      coordinates: command.coordinates,
      price: command.price,
      popularity: command.popularity ?? existing.popularity,
      createdAt: existing.createdAt,
    });

    await this.repository.save(product);
    await this.cache.incr(GENERATION_KEY);

    try {
      await this.searchIndex.index(product);
    } catch (error) {
      this.logger.error(
        `Product ${product.id} updated but indexing failed. The outbox will repair it.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return product;
  }
}

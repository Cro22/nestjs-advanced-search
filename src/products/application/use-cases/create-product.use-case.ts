import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Product } from '@/products/domain/product';
import { PRODUCT_REPOSITORY, ProductRepository } from '@/products/domain/ports/product.repository';
import {
  PRODUCT_SEARCH_INDEX,
  ProductSearchIndex,
} from '@/products/domain/ports/product-search-index.repository';

export interface CreateProductCommand {
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  price: number;
  popularity?: number;
}

/**
 * Write path. Persists to Postgres (source of truth) and then projects the
 * product into Elasticsearch. If indexing fails the product is still safely
 * stored and a later reindex will repair the projection, so the failure is
 * logged but not fatal to the request.
 */
@Injectable()
export class CreateProductUseCase {
  private readonly logger = new Logger(CreateProductUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly repository: ProductRepository,
    @Inject(PRODUCT_SEARCH_INDEX) private readonly searchIndex: ProductSearchIndex,
  ) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const product = Product.create({
      id: randomUUID(),
      name: command.name,
      description: command.description,
      category: command.category,
      subcategories: command.subcategories,
      location: command.location,
      price: command.price,
      popularity: command.popularity ?? 0,
      createdAt: new Date(),
    });

    await this.repository.save(product);

    try {
      await this.searchIndex.index(product);
    } catch (error) {
      this.logger.error(
        `Product ${product.id} saved but indexing failed. Run a reindex to repair.`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    return product;
  }
}

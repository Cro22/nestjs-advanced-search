import { Product as PrismaProduct } from '@prisma/client';
import { Product } from '@/products/domain/product';

/**
 * Translates between the Prisma row and the domain aggregate. Decimal is turned
 * into a plain number here so the domain never depends on Prisma types.
 */
export class ProductMapper {
  static toDomain(row: PrismaProduct): Product {
    return Product.create({
      id: row.id,
      name: row.name,
      description: row.description,
      category: row.category,
      subcategories: row.subcategories,
      location: row.location,
      price: Number(row.price),
      popularity: row.popularity,
      createdAt: row.createdAt,
    });
  }

  static toPersistence(product: Product) {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      subcategories: product.subcategories,
      location: product.location,
      price: product.price,
      popularity: product.popularity,
      createdAt: product.createdAt,
    };
  }
}

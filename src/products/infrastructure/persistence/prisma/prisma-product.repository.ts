import { Injectable } from '@nestjs/common';
import { Product } from '@/products/domain/product';
import { ProductPage, ProductRepository } from '@/products/domain/ports/product.repository';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ProductMapper } from '@/products/infrastructure/persistence/prisma/product.mapper';

@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(product: Product): Promise<void> {
    const data = ProductMapper.toPersistence(product);
    await this.prisma.product.upsert({
      where: { id: product.id },
      create: data,
      update: data,
    });
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? ProductMapper.toDomain(row) : null;
  }

  async count(): Promise<number> {
    return this.prisma.product.count();
  }

  async findBatch(cursor: string | null, limit: number): Promise<ProductPage> {
    const rows = await this.prisma.product.findMany({
      take: limit,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const items = rows.map(ProductMapper.toDomain);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return { items, nextCursor };
  }
}

import { Injectable } from '@nestjs/common';
import { Product } from '@/products/domain/product';
import { ProductPage, ProductRepository } from '@/products/domain/ports/product.repository';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ProductMapper } from '@/products/infrastructure/persistence/prisma/product.mapper';
import { OUTBOX_UPSERT, OUTBOX_DELETE } from '@/products/infrastructure/outbox/outbox.types';

/**
 * Postgres write model. Every mutation records an outbox entry in the same
 * transaction, so a crash between the commit and the Elasticsearch write can
 * never lose the projection: the outbox processor replays it.
 */
@Injectable()
export class PrismaProductRepository implements ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(product: Product): Promise<void> {
    const data = ProductMapper.toPersistence(product);
    await this.prisma.$transaction([
      this.prisma.product.upsert({
        where: { id: product.id },
        create: data,
        update: data,
      }),
      this.prisma.outboxEntry.create({
        data: { productId: product.id, operation: OUTBOX_UPSERT },
      }),
    ]);
  }

  async findById(id: string): Promise<Product | null> {
    const row = await this.prisma.product.findUnique({ where: { id } });
    return row ? ProductMapper.toDomain(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.product.deleteMany({ where: { id } });
      if (result.count === 0) {
        return false;
      }
      await tx.outboxEntry.create({ data: { productId: id, operation: OUTBOX_DELETE } });
      return true;
    });
    return deleted;
  }

  async incrementPopularity(id: string): Promise<Product | null> {
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.product.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        return null;
      }
      const row = await tx.product.update({
        where: { id },
        data: { popularity: { increment: 1 } },
      });
      await tx.outboxEntry.create({ data: { productId: id, operation: OUTBOX_UPSERT } });
      return ProductMapper.toDomain(row);
    });
  }

  async count(): Promise<number> {
    return this.prisma.product.count();
  }

  async contentChecksum(): Promise<string> {
    // Hash the indexed structural fields row by row, then fold the per row
    // digests into one order independent md5. popularity is left out on purpose
    // so the frequent view events never look like drift. Computed in Postgres so
    // the whole table never travels into the process.
    const rows = await this.prisma.$queryRaw<{ checksum: string }[]>`
      SELECT md5(coalesce(string_agg(sig, ',' ORDER BY sig), '')) AS checksum
      FROM (
        SELECT md5(
          id::text || '|' || name || '|' || description || '|' || category || '|' ||
          array_to_string(subcategories, ',') || '|' || location || '|' ||
          coalesce(latitude::text, '') || '|' || coalesce(longitude::text, '') || '|' ||
          price::text || '|' || extract(epoch from created_at)::text
        ) AS sig
        FROM products
      ) signatures
    `;
    return rows[0]?.checksum ?? '';
  }

  async findBatch(cursor: string | null, limit: number): Promise<ProductPage> {
    const rows = await this.prisma.product.findMany({
      take: limit,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const items = rows.map(ProductMapper.toDomain);
    const nextCursor = rows.length === limit ? rows.at(-1)!.id : null;
    return { items, nextCursor };
  }
}

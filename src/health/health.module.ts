import { Module } from '@nestjs/common';
import { HealthController } from '@/health/health.controller';
import { ProductsModule } from '@/products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [HealthController],
})
export class HealthModule {}

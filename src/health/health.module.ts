import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '@/health/health.controller';
import { ElasticsearchHealthIndicator } from '@/health/indicators/elasticsearch.health';
import { RedisHealthIndicator } from '@/health/indicators/redis.health';
import { ProductsModule } from '@/products/products.module';

@Module({
  imports: [TerminusModule, ProductsModule],
  controllers: [HealthController],
  providers: [ElasticsearchHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}

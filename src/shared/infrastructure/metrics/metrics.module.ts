import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';
import { MetricsController } from '@/shared/infrastructure/metrics/metrics.controller';
import { HttpMetricsInterceptor } from '@/shared/infrastructure/metrics/http-metrics.interceptor';

/**
 * Global so any adapter can inject MetricsService without importing the
 * module explicitly; metrics are cross cutting by nature.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}

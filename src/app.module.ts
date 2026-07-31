import { randomUUID } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import configuration from '@/config/configuration';
import { envValidationSchema } from '@/config/env.validation';
import { ProductsModule } from '@/products/products.module';
import { HealthModule } from '@/health/health.module';
import { MetricsModule } from '@/shared/infrastructure/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('logLevel', 'info'),
          // Propagate an inbound correlation id or mint one, so every log
          // line of a request shares the same req.id.
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-request-id'] as string) ?? randomUUID(),
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: {
            ignore: (req: IncomingMessage) => {
              const url = req.url ?? '';
              return url.includes('/health') || url.includes('/metrics');
            },
          },
          ...(config.get<string>('env') === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttlMs', 60000),
            limit: config.get<number>('throttle.limit', 120),
          },
        ],
      }),
    }),
    MetricsModule,
    ProductsModule,
    HealthModule,
  ],
  providers: [
    // In memory storage: limits are per instance. Swapping in a Redis storage
    // is the scale out path once multiple replicas run behind a balancer.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}

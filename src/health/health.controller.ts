import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ElasticsearchHealthIndicator } from '@/health/indicators/elasticsearch.health';
import { RedisHealthIndicator } from '@/health/indicators/redis.health';

/**
 * Readiness vs liveness split. The root route pings every backing service and
 * returns 503 when any is down, so an orchestrator stops routing traffic to a
 * degraded instance. Liveness only proves the process responds, so a Redis
 * outage never causes a restart loop. Both skip throttling: an orchestrator
 * probing on schedule must never see a 429.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly elasticsearch: ElasticsearchHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Readiness check of every backing service' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('postgres', this.prisma),
      () => this.elasticsearch.isHealthy('elasticsearch'),
      () => this.redis.isHealthy('redis'),
    ]);
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Process liveness, no dependency checks' })
  liveness() {
    return { status: 'ok' };
  }
}

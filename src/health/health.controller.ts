import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import Redis from 'ioredis';
import { PrismaService } from '@/products/infrastructure/persistence/prisma/prisma.service';
import { ELASTICSEARCH_CLIENT } from '@/products/infrastructure/search/elasticsearch.client';
import { REDIS_CLIENT } from '@/products/infrastructure/cache/redis-cache.adapter';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ELASTICSEARCH_CLIENT) private readonly es: Client,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness and dependency check' })
  async check() {
    const [postgres, elasticsearch, redis] = await Promise.all([
      this.safe(() => this.prisma.$queryRaw`SELECT 1`),
      this.safe(() => this.es.ping()),
      this.safe(() => this.redis.ping()),
    ]);

    const dependencies = { postgres, elasticsearch, redis };
    const healthy = Object.values(dependencies).every((status) => status === 'up');

    return {
      status: healthy ? 'ok' : 'degraded',
      env: this.config.get<string>('env'),
      dependencies,
    };
  }

  private async safe(check: () => Promise<unknown>): Promise<'up' | 'down'> {
    try {
      await check();
      return 'up';
    } catch {
      return 'down';
    }
  }
}

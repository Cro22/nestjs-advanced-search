import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '@/auth/roles.decorator';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';

@ApiTags('metrics')
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Roles('admin')
  @ApiBearerAuth('api-key')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics exposition' })
  scrape(): Promise<string> {
    return this.metrics.render();
  }
}

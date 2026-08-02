import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { NotFoundException } from '@nestjs/common';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';
import { HttpMetricsInterceptor } from '@/shared/infrastructure/metrics/http-metrics.interceptor';
import { MetricsController } from '@/shared/infrastructure/metrics/metrics.controller';

function httpContext(routePath: string | undefined, statusCode: number): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', route: routePath ? { path: routePath } : undefined }),
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsService', () => {
  it('renders the registry including custom metrics', async () => {
    const service = new MetricsService();
    service.cacheOperations.inc({ operation: 'get', outcome: 'hit' });
    service.outboxPending.set(3);

    const exposition = await service.render();

    expect(exposition).toContain('cache_operations_total{operation="get",outcome="hit"} 1');
    expect(exposition).toContain('outbox_pending_entries 3');
    expect(exposition).toContain('process_cpu_user_seconds_total');
  });
});

describe('HttpMetricsInterceptor', () => {
  it('passes non-HTTP contexts through without recording them', async () => {
    const service = new MetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const context = { getType: () => 'rpc' } as ExecutionContext;
    const next: CallHandler = { handle: () => of('ok') };

    await interceptor.intercept(context, next).toPromise();

    await expect(service.render()).resolves.not.toContain('http_request_duration_seconds_count');
  });

  it('observes the route pattern and status of a successful request', async () => {
    const service = new MetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const next: CallHandler = { handle: () => of('ok') };

    await interceptor.intercept(httpContext('/api/products/search', 200), next).toPromise();

    const exposition = await service.render();
    expect(exposition).toContain('method="GET",route="/api/products/search",status="200"');
  });

  it('records the HttpException status on errors', async () => {
    const service = new MetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const next: CallHandler = { handle: () => throwError(() => new NotFoundException()) };

    await expect(
      interceptor.intercept(httpContext('/api/products/:id', 200), next).toPromise(),
    ).rejects.toBeInstanceOf(NotFoundException);

    const exposition = await service.render();
    expect(exposition).toContain('route="/api/products/:id",status="404"');
  });

  it('uses unmatched and status 500 for an unhandled error', async () => {
    const service = new MetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const next: CallHandler = { handle: () => throwError(() => new Error('boom')) };

    await expect(
      interceptor.intercept(httpContext(undefined, 200), next).toPromise(),
    ).rejects.toThrow('boom');

    const exposition = await service.render();
    expect(exposition).toContain('route="unmatched",status="500"');
  });
});

describe('MetricsController', () => {
  it('returns Prometheus exposition from the service', async () => {
    const metrics = { render: jest.fn().mockResolvedValue('# metrics') };
    const controller = new MetricsController(metrics as unknown as MetricsService);

    await expect(controller.scrape()).resolves.toBe('# metrics');
    expect(metrics.render).toHaveBeenCalled();
  });
});

import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { MetricsService } from '@/shared/infrastructure/metrics/metrics.service';

/**
 * Records a latency observation for every routed request. The route label is
 * the express route pattern (not the raw URL), so cardinality stays bounded.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const started = process.hrtime.bigint();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const observe = (status: number): void => {
      const seconds = Number(process.hrtime.bigint() - started) / 1e9;
      const route = (request.route as { path?: string } | undefined)?.path ?? 'unmatched';
      this.metrics.httpDuration.observe(
        { method: request.method, route, status: String(status) },
        seconds,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => observe(response.statusCode),
        error: (error: unknown) =>
          observe(error instanceof HttpException ? error.getStatus() : 500),
      }),
    );
  }
}

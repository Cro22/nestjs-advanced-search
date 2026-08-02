import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Owns the Prometheus registry and every custom metric. One instance per
 * application (its own Registry, never the global one) so parallel test apps
 * do not fight over metric registration.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** Latency of every routed HTTP request, labeled by route pattern. */
  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  /** Cache traffic seen by the Redis adapter (hit ratio comes from this). */
  readonly cacheOperations = new Counter({
    name: 'cache_operations_total',
    help: 'Cache operations by outcome',
    labelNames: ['operation', 'outcome'] as const,
    registers: [this.registry],
  });

  /** Search backend failures split by how they were classified. */
  readonly searchErrors = new Counter({
    name: 'search_errors_total',
    help: 'Elasticsearch operations that failed',
    labelNames: ['operation', 'kind'] as const,
    registers: [this.registry],
  });

  /** Outbox entries still waiting to be projected, sampled on each drain. */
  readonly outboxPending = new Gauge({
    name: 'outbox_pending_entries',
    help: 'Outbox entries not yet applied to the search index',
    registers: [this.registry],
  });

  /** Outbox entries that exhausted their retries and need manual attention. */
  readonly outboxDeadLettered = new Gauge({
    name: 'outbox_dead_lettered_entries',
    help: 'Outbox entries that failed permanently after exhausting retries',
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}

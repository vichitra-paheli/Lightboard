import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('@lightboard/telemetry');

/** Histogram tracking query execution duration by connector type. */
export const queryDurationMs = meter.createHistogram('query_duration_ms', {
  description: 'Query execution duration in milliseconds',
  unit: 'ms',
});

/** Counter for cache hits. */
export const cacheHitTotal = meter.createCounter('cache_hit_total', {
  description: 'Total number of cache hits',
});

/** Counter for cache misses. */
export const cacheMissTotal = meter.createCounter('cache_miss_total', {
  description: 'Total number of cache misses',
});

/** Gauge for active database connections. */
export const activeConnections = meter.createUpDownCounter('active_connections', {
  description: 'Number of active database connections',
});

/** Records a query execution metric. */
export function recordQueryDuration(connectorType: string, durationMs: number): void {
  queryDurationMs.record(durationMs, { 'connector.type': connectorType });
}

/** Records a cache hit. */
export function recordCacheHit(cacheType: string): void {
  cacheHitTotal.add(1, { 'cache.type': cacheType });
}

/** Records a cache miss. */
export function recordCacheMiss(cacheType: string): void {
  cacheMissTotal.add(1, { 'cache.type': cacheType });
}

/** Updates active connection count. */
export function updateActiveConnections(delta: number): void {
  activeConnections.add(delta);
}

import { describe, expect, it } from 'vitest';
import {
  recordQueryDuration,
  recordCacheHit,
  recordCacheMiss,
  updateActiveConnections,
  queryDurationMs,
  cacheHitTotal,
  cacheMissTotal,
  activeConnections,
} from './metrics';

describe('metrics', () => {
  it('exposes query duration histogram', () => {
    expect(queryDurationMs).toBeDefined();
    // Should not throw
    recordQueryDuration('postgres', 42);
  });

  it('exposes cache hit counter', () => {
    expect(cacheHitTotal).toBeDefined();
    recordCacheHit('schema');
  });

  it('exposes cache miss counter', () => {
    expect(cacheMissTotal).toBeDefined();
    recordCacheMiss('query');
  });

  it('exposes active connections gauge', () => {
    expect(activeConnections).toBeDefined();
    updateActiveConnections(1);
    updateActiveConnections(-1);
  });
});

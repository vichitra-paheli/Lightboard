// SDK setup
export { initTelemetry, shutdownTelemetry } from './setup';

// Custom spans
export { traceAgentLLMCall, traceConnectorQuery, traceDuckDBCompute, withSpan } from './spans';

// Metrics
export {
  activeConnections,
  cacheHitTotal,
  cacheMissTotal,
  queryDurationMs,
  recordCacheHit,
  recordCacheMiss,
  recordQueryDuration,
  updateActiveConnections,
} from './metrics';

// Local exporter
export { PostgresTelemetryExporter } from './exporter';

// Built-in connector
export { TelemetryConnector } from './connector';

// Types
export type { DeploymentMode, TelemetryConfig, TelemetryEvent } from './types';

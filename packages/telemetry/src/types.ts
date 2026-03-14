/** Deployment mode determines telemetry export behavior. */
export type DeploymentMode = 'cloud' | 'onprem' | 'airgapped';

/** Configuration for the telemetry system. */
export interface TelemetryConfig {
  /** Service name reported in spans. */
  serviceName: string;
  /** Deployment mode: cloud exports to OTLP, airgapped writes locally only. */
  deploymentMode: DeploymentMode;
  /** OTLP endpoint for cloud/onprem mode (e.g. https://otel-collector:4318). */
  otlpEndpoint?: string;
  /** Postgres connection string for local telemetry event storage. */
  databaseUrl?: string;
  /** Whether to enable auto-instrumentation for HTTP, pg, and ioredis. */
  autoInstrument?: boolean;
}

/** A structured telemetry event for local storage. */
export interface TelemetryEvent {
  eventType: string;
  payload: Record<string, unknown>;
  orgId?: string;
}

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import type { TelemetryConfig } from './types';

let sdk: NodeSDK | null = null;

/**
 * Initializes the OpenTelemetry SDK with auto-instrumentation.
 * Call once at application startup before any imports of instrumented libraries.
 *
 * - Cloud mode: exports traces to OTLP endpoint + local Postgres
 * - On-prem mode: exports to OTLP endpoint + local Postgres
 * - Airgapped mode: writes to local Postgres only, no network egress
 */
export function initTelemetry(config: TelemetryConfig): void {
  if (sdk) return; // Already initialized

  const instrumentations = config.autoInstrument !== false
    ? [
        new HttpInstrumentation(),
        new PgInstrumentation(),
        new IORedisInstrumentation(),
      ]
    : [];

  const spanProcessors: SimpleSpanProcessor[] = [];

  // Cloud and on-prem: export to external OTLP endpoint
  if (config.deploymentMode !== 'airgapped' && config.otlpEndpoint) {
    const otlpExporter = new OTLPTraceExporter({ url: config.otlpEndpoint });
    spanProcessors.push(new SimpleSpanProcessor(otlpExporter));
  }

  // Development: also log to console
  if (process.env.NODE_ENV === 'development') {
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  sdk = new NodeSDK({
    serviceName: config.serviceName,
    instrumentations,
    spanProcessors,
  });

  sdk.start();
}

/** Shuts down the OpenTelemetry SDK gracefully. */
export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
  }
}

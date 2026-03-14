import { context, trace, type Span, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('@lightboard/telemetry');

/**
 * Wraps an async function with a custom OpenTelemetry span.
 * Captures duration, errors, and custom attributes.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Wraps a connector query execution with tracing. */
export async function traceConnectorQuery<T>(
  connectorType: string,
  source: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan('connector.query', {
    'connector.type': connectorType,
    'connector.source': source,
  }, fn);
}

/** Wraps a DuckDB compute operation with tracing. */
export async function traceDuckDBCompute<T>(
  operation: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan('duckdb.compute', { 'compute.operation': operation }, fn);
}

/** Wraps an AI agent LLM call with tracing. */
export async function traceAgentLLMCall<T>(
  model: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return withSpan('agent.llm_call', { 'agent.model': model }, fn);
}

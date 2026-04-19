/**
 * Per-connector visual metadata: display label + two-letter glyph + dot color.
 * Mirrors `project/components/settings/Datasources.jsx` `KIND_META`.
 *
 * Our DB enum is narrower than the handoff catalog — `postgres`, `mysql`,
 * `clickhouse`, `rest`, `csv`, `prometheus`, `elasticsearch` — but we keep
 * the extra entries here so forward-compat connectors render correctly
 * when they land.
 */
export interface KindMeta {
  label: string;
  glyph: string;
  dot: string;
}

export const KIND_META: Record<string, KindMeta> = {
  postgres: { label: 'PostgreSQL', glyph: 'pg', dot: '#8AB4B8' },
  mysql: { label: 'MySQL', glyph: 'my', dot: '#7DB469' },
  snowflake: { label: 'Snowflake', glyph: 'sf', dot: '#E89B52' },
  bigquery: { label: 'BigQuery', glyph: 'bq', dot: '#B08CA8' },
  clickhouse: { label: 'ClickHouse', glyph: 'ch', dot: '#F2C265' },
  redshift: { label: 'Redshift', glyph: 'rs', dot: '#9B9BE8' },
  duckdb: { label: 'DuckDB', glyph: 'dd', dot: '#E8C87D' },
  rest: { label: 'REST', glyph: 'rs', dot: '#8AB4B8' },
  csv: { label: 'CSV', glyph: 'cs', dot: '#BDBDC4' },
  prometheus: { label: 'Prometheus', glyph: 'pr', dot: '#E76F51' },
  elasticsearch: { label: 'Elasticsearch', glyph: 'es', dot: '#D9A441' },
};

/** Lookup helper — returns a safe fallback for unknown types. */
export function getKindMeta(kind: string): KindMeta {
  return KIND_META[kind] ?? { label: kind, glyph: kind.slice(0, 2), dot: 'var(--ink-5)' };
}

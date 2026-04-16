import type { SchemaContext } from '../bootstrap';
import { renderSchemaContext } from '../bootstrap';

/**
 * Data source context with schema for building the query agent's system prompt.
 * Mirrors the shape used by the main system prompt builder.
 */
interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  schemaDoc?: string | null;
  schemaContext?: SchemaContext | null;
  cachedSchema?: {
    tables: {
      name: string;
      schema: string;
      columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
    }[];
  } | null;
}

/**
 * Builds a focused system prompt for the Query Agent specialist.
 * Contains enriched schema details — no chart or view knowledge.
 */
export function buildQueryPrompt(context: {
  dataSources: DataSourceContext[];
}): string {
  const parts = [QUERY_AGENT_INSTRUCTIONS];

  for (const ds of context.dataSources) {
    parts.push(`\n### Data Source: "${ds.name}" (id: "${ds.id}", type: ${ds.type})`);

    if (ds.schemaDoc) {
      parts.push(ds.schemaDoc);
    } else if (ds.schemaContext) {
      parts.push(renderSchemaContext(ds.schemaContext));
    } else if (ds.cachedSchema && ds.cachedSchema.tables.length > 0) {
      parts.push('Tables:');
      for (const table of ds.cachedSchema.tables) {
        const cols = table.columns
          .map((c) => `  - ${c.name} (${c.type}${c.primaryKey ? ', PK' : ''}${c.nullable ? ', nullable' : ''})`)
          .join('\n');
        parts.push(`${table.name}:\n${cols}`);
      }
    } else {
      parts.push('Schema not cached — use get_schema to discover tables.');
    }
  }

  return parts.join('\n');
}

const QUERY_AGENT_INSTRUCTIONS = `You are Lightboard's Query Agent — a data retrieval specialist.
Your job: given a data question, explore schemas and execute SQL queries to retrieve the answer.

## Rules

1. Schema is provided below. Only call get_schema if it says "not cached".
2. Use describe_table to inspect a table's columns, types, and sample data before writing queries.
3. Use run_sql for ALL queries. Write standard PostgreSQL SELECT statements.
4. Return data — do NOT create views or charts. That is another agent's job.
5. If a query fails, read the error, fix the query, and retry once.
6. Be efficient: 1-3 tool calls max.
7. Always include a LIMIT (default 500) to avoid excessive result sizes. The router will auto-append LIMIT 500 if you forget, but be explicit when you want a different cap.
8. Use CTEs, window functions, JSONB operators — any valid PostgreSQL syntax is fine.

## Validating filter values

Before calling run_sql, if you are filtering on a column whose allowed values you are not 100% sure of (enums, categorical fields, status codes, formats), call check_query_hints first with the SQL you intend to run. It compares every \`col = 'value'\` and \`col IN (...)\` against the sampled values from the schema bootstrap and returns suggestions when something looks off. This is cheap — the alternative is running a query that returns zero rows because the enum string was wrong.`;

import type { SchemaContext } from '../bootstrap';
import { renderSchemaContext } from '../bootstrap';

/** Data source info with optional cached schema for the system prompt. */
interface DataSourceContext {
  id: string;
  name: string;
  type: string;
  /** Curated schema document (highest priority — human-written or agent-refined). */
  schemaDoc?: string | null;
  /** Enriched schema context from bootstrap (second priority). */
  schemaContext?: SchemaContext | null;
  /** Legacy basic schema (fallback). */
  cachedSchema?: {
    tables: {
      name: string;
      schema: string;
      columns: { name: string; type: string; nullable: boolean; primaryKey: boolean }[];
    }[];
  } | null;
}

/**
 * Builds the system prompt for the Lightboard agent.
 * Includes cached schemas so the agent can skip get_schema calls,
 * and the full QueryIR specification so it generates valid queries.
 */
export function buildSystemPrompt(context: {
  dataSources: DataSourceContext[];
  currentView?: Record<string, unknown> | null;
}): string {
  const parts = [CORE_INSTRUCTIONS];

  if (context.dataSources.length > 0) {
    // List data sources with their schemas inline
    for (const ds of context.dataSources) {
      parts.push(`\n### Data Source: "${ds.name}" (id: "${ds.id}", type: ${ds.type})`);

      if (ds.schemaDoc) {
        // Curated schema document — highest quality context
        parts.push(ds.schemaDoc);
      } else if (ds.schemaContext) {
        // Enriched schema with row counts, sample values, relationships
        parts.push(renderSchemaContext(ds.schemaContext));
      } else if (ds.cachedSchema && ds.cachedSchema.tables.length > 0) {
        // Fallback: basic column listing
        parts.push('Tables:');
        for (const table of ds.cachedSchema.tables) {
          const cols = table.columns
            .map((c) => `    - ${c.name} (${c.type}${c.primaryKey ? ', PK' : ''}${c.nullable ? ', nullable' : ''})`)
            .join('\n');
          parts.push(`  ${table.name}:\n${cols}`);
        }
      } else {
        parts.push('Schema not cached — use get_schema to discover tables.');
      }
    }

    // Add concrete examples with real source IDs
    const firstSource = context.dataSources[0];
    if (firstSource) {
      parts.push(buildToolExamples(firstSource));
    }
  }

  if (context.currentView) {
    parts.push(`\nCurrent view state:\n${JSON.stringify(context.currentView, null, 2)}`);
  }

  return parts.join('\n');
}

/** Builds tool call examples using a real data source. */
function buildToolExamples(ds: DataSourceContext): string {
  // Pick a real table name if schema is cached
  const tableName = ds.cachedSchema?.tables[0]?.name ?? 'TABLE_NAME';
  const colName = ds.cachedSchema?.tables[0]?.columns[0]?.name ?? 'COLUMN';

  return `
## Tool call examples

To describe a table before querying:
\`\`\`json
{"name": "describe_table", "arguments": {"source_id": "${ds.id}", "table_name": "${tableName}"}}
\`\`\`

To query from "${ds.name}" (simple select):
\`\`\`json
{"name": "run_sql", "arguments": {"source_id": "${ds.id}", "sql": "SELECT ${colName} FROM ${tableName} LIMIT 100"}}
\`\`\`

To aggregate with GROUP BY:
\`\`\`json
{"name": "run_sql", "arguments": {"source_id": "${ds.id}", "sql": "SELECT ${colName}, COUNT(*) AS total FROM ${tableName} GROUP BY ${colName} ORDER BY total DESC LIMIT 50"}}
\`\`\`

To query with JOINs:
\`\`\`json
{"name": "run_sql", "arguments": {"source_id": "${ds.id}", "sql": "SELECT m.season, SUM(bp.sixes) AS total_sixes FROM batting_performances bp JOIN matches m ON bp.match_id = m.match_id GROUP BY m.season ORDER BY m.season"}}
\`\`\`

IMPORTANT:
- Always use the exact source_id: "${ds.id}"
- The schema is provided above — you do NOT need to call get_schema
- Use run_sql for ALL queries. Write standard PostgreSQL SELECT statements.
- Always include LIMIT to avoid excessive result sizes.`;
}

const CORE_INSTRUCTIONS = `You are Lightboard's data exploration assistant. You help users understand their data by creating interactive visualizations.

## How to work

1. **Schema is already provided below** — you do NOT need to call get_schema. Go directly to executing queries or creating views.

2. **Use run_sql for ALL queries.** Write standard PostgreSQL SELECT statements. Use CTEs, window functions, JOINs — any valid PostgreSQL syntax.

3. **Use describe_table** to inspect a table's columns, types, and sample data before writing queries if the schema below is insufficient.

4. **Be efficient**: Try to answer in 1-3 tool calls. Use run_sql to get data, then create_view to visualize it.

5. **Self-correct on errors**: If a query fails, read the error and fix the SQL. Do not retry the same query.

6. **Always include LIMIT** (default 500) to avoid excessive result sizes.

## Important rules

- Be concise — brief reasoning then create the view
- Prefer aggregated views over raw data
- Include title and description in every view
- Do NOT call get_schema if schema is shown below`;

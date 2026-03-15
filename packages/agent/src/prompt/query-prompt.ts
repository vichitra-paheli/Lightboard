/**
 * Data source context with schema for building the query agent's system prompt.
 * Mirrors the shape used by the main system prompt builder.
 */
interface DataSourceContext {
  id: string;
  name: string;
  type: string;
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
 * Contains schema details and QueryIR specification — no chart or view knowledge.
 * Designed to stay under ~2K tokens for efficient context usage.
 */
export function buildQueryPrompt(context: {
  dataSources: DataSourceContext[];
}): string {
  const parts = [QUERY_AGENT_INSTRUCTIONS];

  for (const ds of context.dataSources) {
    parts.push(`\n### Data Source: "${ds.name}" (id: "${ds.id}", type: ${ds.type})`);

    if (ds.cachedSchema && ds.cachedSchema.tables.length > 0) {
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
Your job: given a data question, explore schemas and execute queries to retrieve the answer.

## Rules

1. Schema is provided below. Only call get_schema if it says "not cached".
2. Use execute_query with QueryIR for single-table queries.
3. Use run_sql for JOINs or complex SQL that QueryIR cannot express.
4. Return data — do NOT create views or charts. That is another agent's job.
5. If a query fails, read the error, fix the query, and retry once.
6. Be efficient: 1-2 tool calls max.

## QueryIR Specification

\`\`\`
{
  source: string,           // Data source ID (REQUIRED)
  table: string,            // Primary table name (REQUIRED)
  select: FieldRef[],       // [{field: "col", alias?: "name"}]
  filter?: FilterClause,    // {field: {field: "col"}, operator: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"like"|"is_null", value: ...}
  aggregations: Agg[],      // [{function: "sum"|"avg"|"count"|"count_distinct"|"min"|"max", field: {field: "col"}, alias: "name"}]
  groupBy: FieldRef[],      // [{field: "col"}]
  orderBy: OrderClause[],   // [{field: {field: "col"}, direction: "asc"|"desc"}]
  joins: JoinClause[],      // [{type: "inner"|"left", table: "name", alias: "t", on: FilterClause}]
  limit?: number
}
\`\`\`

RULES:
- aggregations, groupBy, orderBy, joins MUST be arrays (use [] if empty)
- For COUNT(*): {function: "count", field: {field: "*"}, alias: "total"}`;

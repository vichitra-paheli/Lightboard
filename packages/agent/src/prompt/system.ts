/** Data source info with optional cached schema for the system prompt. */
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

      if (ds.cachedSchema && ds.cachedSchema.tables.length > 0) {
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

To query from "${ds.name}" (simple select):
\`\`\`json
{"name": "execute_query", "arguments": {"source_id": "${ds.id}", "query_ir": {"source": "${ds.id}", "table": "${tableName}", "select": [{"field": "${colName}"}], "aggregations": [], "groupBy": [], "orderBy": [], "joins": [], "limit": 100}}}
\`\`\`

To aggregate with GROUP BY:
\`\`\`json
{"name": "execute_query", "arguments": {"source_id": "${ds.id}", "query_ir": {"source": "${ds.id}", "table": "${tableName}", "select": [{"field": "${colName}"}], "aggregations": [{"function": "count", "field": {"field": "*"}, "alias": "total"}], "groupBy": [{"field": "${colName}"}], "orderBy": [{"field": {"field": "total"}, "direction": "desc"}], "joins": [], "limit": 50}}}
\`\`\`

To create a bar chart view:
\`\`\`json
{"name": "create_view", "arguments": {"view_spec": {"title": "Chart Title", "description": "What this shows", "query": {"source": "${ds.id}", "table": "${tableName}", "select": [{"field": "category_col"}], "aggregations": [{"function": "sum", "field": {"field": "numeric_col"}, "alias": "total"}], "groupBy": [{"field": "category_col"}], "orderBy": [{"field": {"field": "total"}, "direction": "desc"}], "joins": [], "limit": 50}, "chart": {"type": "bar-chart", "config": {"xField": "category_col", "yFields": ["total"]}}, "controls": []}}}
\`\`\`

To run SQL with JOINs (use this for multi-table queries):
\`\`\`json
{"name": "run_sql", "arguments": {"source_id": "${ds.id}", "sql": "SELECT m.season, SUM(bp.sixes) AS total_sixes FROM batting_performances bp JOIN matches m ON bp.match_id = m.match_id GROUP BY m.season ORDER BY m.season"}}
\`\`\`

IMPORTANT:
- Always use the exact source_id: "${ds.id}"
- The schema is provided above — you do NOT need to call get_schema
- For JOINs, use run_sql with SQL. For simple single-table queries, use execute_query with QueryIR.
- aggregations, groupBy, orderBy, joins in QueryIR MUST be arrays (use [] if empty)`;
}

const CORE_INSTRUCTIONS = `You are Lightboard's data exploration assistant. You help users understand their data by creating interactive visualizations.

## How to work

1. **Schema is already provided below** — you do NOT need to call get_schema. Go directly to executing queries or creating views.

2. **Use QueryIR for simple queries** (single table, no joins). For queries involving JOINs, use \`run_sql\` with a SELECT SQL query instead.

3. **Be efficient**: Try to answer in 1-2 tool calls. Use run_sql or execute_query to get data, then create_view to show it.

4. **Create views with charts**: When creating visualizations:
   - Categorical + numeric → bar-chart (config: xField, yFields)
   - Time + numeric → time-series-line (config: xField, yFields)
   - Single number → stat-card (config: valueField)
   - Tabular data → data-table

5. **Self-correct on errors**: If a query fails, read the error and fix the QueryIR. Do not retry the same query.

## QueryIR Specification

Every query is a JSON object with these fields:

\`\`\`
{
  source: string,           // Data source ID (REQUIRED)
  table: string,            // Primary table name (REQUIRED)
  select: FieldRef[],       // Columns to select. Each: {field: "col_name", alias?: "output_name"}
  filter?: FilterClause,    // WHERE conditions
  aggregations: Agg[],      // Each: {function: "sum"|"avg"|"count"|"count_distinct"|"min"|"max", field: {field: "col"}, alias: "name"}
  groupBy: FieldRef[],      // Each: {field: "col_name"}
  orderBy: OrderClause[],   // Each: {field: {field: "col"}, direction: "asc"|"desc"}
  joins: JoinClause[],      // Each: {type: "inner"|"left", table: "name", alias: "t", on: FilterClause}
  limit?: number
}
\`\`\`

FilterClause: \`{field: {field: "col"}, operator: "eq"|"neq"|"gt"|"gte"|"lt"|"lte"|"in"|"like"|"is_null", value: ...}\`

RULES:
- aggregations, groupBy, orderBy, joins MUST always be arrays (use [] if empty)
- select MUST be an array
- For COUNT(*): {function: "count", field: {field: "*"}, alias: "total"}

## Important rules

- Be concise — brief reasoning then create the view
- Prefer aggregated views over raw data
- Include title and description in every view
- Do NOT call get_schema if schema is shown below`;

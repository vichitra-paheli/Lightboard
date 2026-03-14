import type {
  Aggregation,
  FieldRef,
  FilterClause,
  JoinClause,
  OrderClause,
  QueryIR,
  TimeRange,
} from '@lightboard/query-ir';

/** Result of IR-to-SQL translation: parameterized SQL + values. */
export interface TranslationResult {
  sql: string;
  params: unknown[];
}

/** Mutable context tracking parameter index during translation. */
interface TranslationContext {
  params: unknown[];
  paramIndex: number;
}

/** Adds a parameter and returns its placeholder ($1, $2, etc.). */
function addParam(ctx: TranslationContext, value: unknown): string {
  ctx.params.push(value);
  ctx.paramIndex++;
  return `$${ctx.paramIndex}`;
}

/** Formats a field reference as qualified SQL. */
function formatField(ref: FieldRef): string {
  const qualified = ref.table ? `"${ref.table}"."${ref.field}"` : `"${ref.field}"`;
  return ref.alias ? `${qualified} AS "${ref.alias}"` : qualified;
}

/** Formats a field reference without alias (for GROUP BY, ORDER BY). */
function formatFieldRef(ref: FieldRef): string {
  return ref.table ? `"${ref.table}"."${ref.field}"` : `"${ref.field}"`;
}

/** Translates a filter clause to SQL with parameterized values. */
function translateFilter(clause: FilterClause, ctx: TranslationContext): string {
  if ('and' in clause) {
    const parts = clause.and.map((c) => translateFilter(c, ctx));
    return `(${parts.join(' AND ')})`;
  }
  if ('or' in clause) {
    const parts = clause.or.map((c) => translateFilter(c, ctx));
    return `(${parts.join(' OR ')})`;
  }

  const field = formatFieldRef(clause.field);

  switch (clause.operator) {
    case 'eq':
      return `${field} = ${addParam(ctx, clause.value)}`;
    case 'neq':
      return `${field} != ${addParam(ctx, clause.value)}`;
    case 'gt':
      return `${field} > ${addParam(ctx, clause.value)}`;
    case 'gte':
      return `${field} >= ${addParam(ctx, clause.value)}`;
    case 'lt':
      return `${field} < ${addParam(ctx, clause.value)}`;
    case 'lte':
      return `${field} <= ${addParam(ctx, clause.value)}`;
    case 'like':
      return `${field} LIKE ${addParam(ctx, clause.value)}`;
    case 'is_null':
      return `${field} IS NULL`;
    case 'is_not_null':
      return `${field} IS NOT NULL`;
    case 'in': {
      const values = clause.value as (string | number)[];
      const placeholders = values.map((v) => addParam(ctx, v)).join(', ');
      return `${field} IN (${placeholders})`;
    }
    case 'not_in': {
      const values = clause.value as (string | number)[];
      const placeholders = values.map((v) => addParam(ctx, v)).join(', ');
      return `${field} NOT IN (${placeholders})`;
    }
    default:
      throw new Error(`Unsupported filter operator: ${clause.operator}`);
  }
}

/** Translates an aggregation to SQL. */
function translateAggregation(agg: Aggregation): string {
  const field = formatFieldRef(agg.field);
  let expr: string;

  switch (agg.function) {
    case 'sum':
      expr = `SUM(${field})`;
      break;
    case 'avg':
      expr = `AVG(${field})`;
      break;
    case 'count':
      expr = field === '"*"' ? 'COUNT(*)' : `COUNT(${field})`;
      break;
    case 'count_distinct':
      expr = `COUNT(DISTINCT ${field})`;
      break;
    case 'min':
      expr = `MIN(${field})`;
      break;
    case 'max':
      expr = `MAX(${field})`;
      break;
    case 'percentile': {
      const p = agg.params?.p ?? 0.5;
      expr = `PERCENTILE_CONT(${p}) WITHIN GROUP (ORDER BY ${field})`;
      break;
    }
    default:
      throw new Error(`Unsupported aggregation: ${agg.function}`);
  }

  return agg.alias ? `${expr} AS "${agg.alias}"` : expr;
}

/** Translates a time range to a SQL WHERE clause fragment. */
function translateTimeRange(range: TimeRange, ctx: TranslationContext): string {
  const field = formatFieldRef(range.field);
  const from = addParam(ctx, range.from);
  const to = addParam(ctx, range.to);
  return `${field} >= ${from} AND ${field} <= ${to}`;
}

/** Translates a join clause to SQL. */
function translateJoin(join: JoinClause, ctx: TranslationContext): string {
  const type = join.type.toUpperCase();
  const alias = join.alias ? ` "${join.alias}"` : '';
  const on = translateFilter(join.on, ctx);
  return `${type} JOIN "${join.table}"${alias} ON ${on}`;
}

/** Translates an order clause to SQL. */
function translateOrder(order: OrderClause): string {
  return `${formatFieldRef(order.field)} ${order.direction.toUpperCase()}`;
}

/**
 * Translates a QueryIR into parameterized PostgreSQL SQL.
 * All user values are parameterized ($1, $2, etc.) to prevent SQL injection.
 */
export function translateIR(ir: QueryIR): TranslationResult {
  const ctx: TranslationContext = { params: [], paramIndex: 0 };
  const parts: string[] = [];

  // SELECT
  const selectParts: string[] = [];
  if (ir.select.length > 0) {
    selectParts.push(...ir.select.map(formatField));
  }
  if (ir.aggregations.length > 0) {
    selectParts.push(...ir.aggregations.map(translateAggregation));
  }
  parts.push(`SELECT ${selectParts.length > 0 ? selectParts.join(', ') : '*'}`);

  // FROM
  const tableAlias = ir.tableAlias ? ` "${ir.tableAlias}"` : '';
  parts.push(`FROM "${ir.table}"${tableAlias}`);

  // JOINS
  for (const join of ir.joins) {
    parts.push(translateJoin(join, ctx));
  }

  // WHERE
  const whereConditions: string[] = [];
  if (ir.filter) {
    whereConditions.push(translateFilter(ir.filter, ctx));
  }
  if (ir.timeRange) {
    whereConditions.push(translateTimeRange(ir.timeRange, ctx));
  }
  if (whereConditions.length > 0) {
    parts.push(`WHERE ${whereConditions.join(' AND ')}`);
  }

  // GROUP BY
  if (ir.groupBy.length > 0) {
    parts.push(`GROUP BY ${ir.groupBy.map(formatFieldRef).join(', ')}`);
  }

  // ORDER BY
  if (ir.orderBy.length > 0) {
    parts.push(`ORDER BY ${ir.orderBy.map(translateOrder).join(', ')}`);
  }

  // LIMIT
  if (ir.limit !== undefined) {
    parts.push(`LIMIT ${addParam(ctx, ir.limit)}`);
  }

  // OFFSET
  if (ir.offset !== undefined) {
    parts.push(`OFFSET ${addParam(ctx, ir.offset)}`);
  }

  return { sql: parts.join(' '), params: ctx.params };
}

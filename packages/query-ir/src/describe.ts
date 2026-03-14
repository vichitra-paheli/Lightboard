import type { Aggregation, FieldRef, FilterClause, QueryIR } from './types';

/** Formats a field reference as a readable string. */
function describeField(ref: FieldRef): string {
  const qualified = ref.table ? `${ref.table}.${ref.field}` : ref.field;
  return ref.alias ? `${qualified} as ${ref.alias}` : qualified;
}

/** Formats an aggregation as a readable string. */
function describeAgg(agg: Aggregation): string {
  const fn = agg.function.toUpperCase();
  const field = describeField(agg.field);
  const base = `${fn}(${field})`;
  return agg.alias ? `${base} as ${agg.alias}` : base;
}

/** Formats a filter clause as a readable string. */
function describeFilter(clause: FilterClause): string {
  if ('and' in clause) {
    return `(${clause.and.map(describeFilter).join(' AND ')})`;
  }
  if ('or' in clause) {
    return `(${clause.or.map(describeFilter).join(' OR ')})`;
  }
  const field = describeField(clause.field);
  const op = clause.operator.toUpperCase().replace('_', ' ');
  if (clause.operator === 'is_null' || clause.operator === 'is_not_null') {
    return `${field} ${op}`;
  }
  const val = Array.isArray(clause.value)
    ? `(${clause.value.join(', ')})`
    : JSON.stringify(clause.value);
  return `${field} ${op} ${val}`;
}

/**
 * Produces a human-readable summary of a QueryIR.
 * Useful for displaying what a query does to end users.
 */
export function describe(ir: QueryIR): string {
  const parts: string[] = [];

  // SELECT
  if (ir.aggregations.length > 0) {
    const aggs = ir.aggregations.map(describeAgg).join(', ');
    const fields = ir.select.length > 0 ? ir.select.map(describeField).join(', ') + ', ' : '';
    parts.push(`SELECT ${fields}${aggs}`);
  } else if (ir.select.length > 0) {
    parts.push(`SELECT ${ir.select.map(describeField).join(', ')}`);
  } else {
    parts.push('SELECT *');
  }

  // FROM
  const table = ir.tableAlias ? `${ir.table} ${ir.tableAlias}` : ir.table;
  parts.push(`FROM ${ir.source}.${table}`);

  // JOINS
  for (const join of ir.joins) {
    const alias = join.alias ? ` ${join.alias}` : '';
    parts.push(`${join.type.toUpperCase()} JOIN ${join.table}${alias} ON ${describeFilter(join.on)}`);
  }

  // WHERE
  if (ir.filter) {
    parts.push(`WHERE ${describeFilter(ir.filter)}`);
  }

  // TIME RANGE
  if (ir.timeRange) {
    parts.push(`TIME ${describeField(ir.timeRange.field)} FROM ${ir.timeRange.from} TO ${ir.timeRange.to}`);
  }

  // GROUP BY
  if (ir.groupBy.length > 0) {
    parts.push(`GROUP BY ${ir.groupBy.map(describeField).join(', ')}`);
  }

  // ORDER BY
  if (ir.orderBy.length > 0) {
    const orders = ir.orderBy.map((o) => `${describeField(o.field)} ${o.direction.toUpperCase()}`);
    parts.push(`ORDER BY ${orders.join(', ')}`);
  }

  // LIMIT / OFFSET
  if (ir.limit !== undefined) {
    parts.push(`LIMIT ${ir.limit}`);
  }
  if (ir.offset !== undefined) {
    parts.push(`OFFSET ${ir.offset}`);
  }

  return parts.join('\n');
}

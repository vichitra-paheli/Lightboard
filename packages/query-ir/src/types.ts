/** A reference to a field (column or expression). */
export interface FieldRef {
  field: string;
  table?: string;
  alias?: string;
}

/** A comparison operator for filter conditions. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'like'
  | 'is_null'
  | 'is_not_null';

/** A single filter condition. */
export interface FilterCondition {
  field: FieldRef;
  operator: FilterOperator;
  value?: string | number | boolean | null | (string | number)[];
}

/** A filter clause: a condition, or boolean combinator of clauses. */
export type FilterClause = FilterCondition | { and: FilterClause[] } | { or: FilterClause[] };

/** An aggregation function name. */
export type AggregationFunction =
  | 'sum'
  | 'avg'
  | 'count'
  | 'count_distinct'
  | 'min'
  | 'max'
  | 'percentile';

/** An aggregation expression. */
export interface Aggregation {
  function: AggregationFunction;
  field: FieldRef;
  alias?: string;
  params?: Record<string, string | number>;
}

/** An ordering clause. */
export interface OrderClause {
  field: FieldRef;
  direction: 'asc' | 'desc';
}

/** A time range filter. */
export interface TimeRange {
  field: FieldRef;
  from: string;
  to: string;
}

/** A join clause. */
export interface JoinClause {
  type: 'inner' | 'left' | 'right' | 'cross';
  table: string;
  alias?: string;
  on: FilterClause;
}

/** The full Query Intermediate Representation. */
export interface QueryIR {
  source: string;
  table: string;
  tableAlias?: string;
  select: FieldRef[];
  filter?: FilterClause;
  aggregations: Aggregation[];
  groupBy: FieldRef[];
  orderBy: OrderClause[];
  timeRange?: TimeRange;
  joins: JoinClause[];
  limit?: number;
  offset?: number;
}

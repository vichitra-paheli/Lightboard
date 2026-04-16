/**
 * Lightweight SQL sanity checker. Compares literal values referenced in
 * `WHERE col = 'x'` and `WHERE col IN ('x', 'y')` clauses against the
 * sample values collected by the schema bootstrap. Surfaces "did you mean"
 * hints so the agent can self-correct before burning a round on a bad enum.
 *
 * This is intentionally regex-based. It catches the common shapes without
 * the weight of a full SQL parser. If a filter value is genuinely valid but
 * just not present in the sampled set we prefer a false-positive warning
 * over a false negative — the tool output lists the sampled values so the
 * agent can judge.
 */

/** Kind of hint raised for a filter clause. */
export type QueryHintKind = 'enum_mismatch' | 'unknown_column';

/** Individual warning raised by the hint checker. */
export interface QueryHint {
  kind: QueryHintKind;
  column: string;
  value: string;
  message: string;
  suggested_values?: string[];
}

/** Schema context shape this module cares about. */
export interface HintSchemaContext {
  tables?: Array<{
    name: string;
    sampleValues?: Record<string, unknown[]>;
  }>;
}

/** Top-level result returned by the tool. */
export interface QueryHintsResult {
  ok: boolean;
  warnings: QueryHint[];
}

/**
 * Build a map of column-name → list of observed sample values, aggregated
 * across every table in the schema context. Case-insensitive keys so
 * `"Region"` and `"region"` alias to the same bucket.
 */
function buildColumnIndex(context: HintSchemaContext): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const table of context.tables ?? []) {
    const samples = table.sampleValues ?? {};
    for (const [col, values] of Object.entries(samples)) {
      if (!Array.isArray(values)) continue;
      const key = col.toLowerCase();
      const bucket = index.get(key) ?? new Set<string>();
      for (const v of values) {
        if (v === null || v === undefined) continue;
        bucket.add(String(v));
      }
      index.set(key, bucket);
    }
  }
  return index;
}

/** Strip wrapping quotes/backticks from an identifier. */
function stripIdentifier(raw: string): string {
  return raw.replace(/^[`"']/, '').replace(/[`"']$/, '');
}

/**
 * Resolve a possibly-qualified, possibly-quoted identifier to its lookup
 * key. For `"matches"."format"` the key is `format`; for `m.format` → `format`;
 * for `format` → `format`.
 */
function extractColumnKey(raw: string): string {
  const parts = raw.split('.').map((p) => stripIdentifier(p));
  return parts[parts.length - 1]!.toLowerCase();
}

/** Extract literal string values from a comma-separated list. */
function extractLiterals(list: string): string[] {
  const literals: string[] = [];
  const re = /'((?:[^']|'')*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(list)) !== null) {
    literals.push(m[1]!.replace(/''/g, "'"));
  }
  return literals;
}

/**
 * Return warnings for any literal value that does not appear in the
 * sampled values for its column. Columns not represented in the context
 * are skipped silently — the checker is conservative by design.
 */
export function checkQueryHints(
  sql: string,
  context: HintSchemaContext | null | undefined,
): QueryHintsResult {
  if (!sql || !context) return { ok: true, warnings: [] };

  const columnIndex = buildColumnIndex(context);
  if (columnIndex.size === 0) return { ok: true, warnings: [] };

  const warnings: QueryHint[] = [];

  // Identifier pattern: allows bare names, quoted names, and qualified
  // forms (table.col, "schema"."col", m.`format`, etc.). We're lax on purpose.
  const identifier = String.raw`[\w.` + '`' + `"']+`;

  // Match `col = 'value'` — col may be quoted, backticked, or bare. Value is always single-quoted.
  const equalsPattern = new RegExp(
    `(?:^|[\\s(,])(${identifier})\\s*=\\s*'((?:[^']|'')*)'`,
    'g',
  );
  let m: RegExpExecArray | null;
  while ((m = equalsPattern.exec(sql)) !== null) {
    const rawCol = stripIdentifier(m[1]!);
    const colKey = extractColumnKey(rawCol);
    const value = m[2]!.replace(/''/g, "'");
    const samples = columnIndex.get(colKey);
    if (!samples || samples.size === 0) continue;
    if (!samples.has(value)) {
      const suggested = Array.from(samples).slice(0, 10);
      warnings.push({
        kind: 'enum_mismatch',
        column: rawCol,
        value,
        message: `Value "${value}" not seen in samples for column "${rawCol}". Observed values: ${suggested.join(', ')}`,
        suggested_values: suggested,
      });
    }
  }

  // Match `col IN ('v1', 'v2', ...)` — any literal that isn't in samples is a mismatch.
  const inPattern = new RegExp(`(${identifier})\\s+IN\\s*\\(([^)]*)\\)`, 'gi');
  while ((m = inPattern.exec(sql)) !== null) {
    const rawCol = stripIdentifier(m[1]!);
    const colKey = extractColumnKey(rawCol);
    const samples = columnIndex.get(colKey);
    if (!samples || samples.size === 0) continue;
    for (const literal of extractLiterals(m[2]!)) {
      if (!samples.has(literal)) {
        const suggested = Array.from(samples).slice(0, 10);
        warnings.push({
          kind: 'enum_mismatch',
          column: rawCol,
          value: literal,
          message: `Value "${literal}" not seen in samples for column "${rawCol}" (IN-list). Observed values: ${suggested.join(', ')}`,
          suggested_values: suggested,
        });
      }
    }
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Shared constants for the agent tool layer.
 * Keeping these centralised so tool descriptions and runtime enforcement
 * can never drift out of sync.
 */

/** Maximum rows returned by `run_sql`. Enforced by the router. */
export const DEFAULT_ROW_LIMIT = 500;

/**
 * Append a `LIMIT` clause to a SQL statement if one is not already present.
 * Kept deliberately simple — we only need to catch the common case where
 * the model omits a limit entirely. A redundant outer LIMIT is harmless.
 *
 * - Trims a trailing semicolon.
 * - Skips if the statement already contains a top-level `LIMIT` (case-insensitive).
 *   We only look at the final non-parenthesised region to reduce false negatives
 *   from LIMIT clauses inside subqueries.
 */
export function ensureLimit(sql: string, cap: number = DEFAULT_ROW_LIMIT): string {
  if (!sql) return sql;
  let stripped = sql.trim();
  while (stripped.endsWith(';')) stripped = stripped.slice(0, -1).trimEnd();

  // Look for `LIMIT` appearing after the last top-level closing paren so that
  // limits inside a subquery don't mask a missing outer limit.
  const lastParen = stripped.lastIndexOf(')');
  const tail = lastParen >= 0 ? stripped.slice(lastParen + 1) : stripped;
  if (/\bLIMIT\b/i.test(tail)) return stripped;

  return `${stripped} LIMIT ${cap}`;
}

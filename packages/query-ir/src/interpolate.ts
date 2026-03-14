import type { QueryIR } from './types';

/** Variable map: keys are variable names (without $), values are substitution values. */
export type VariableMap = Record<string, string | number | boolean | null>;

const VARIABLE_PATTERN = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;

/**
 * Substitutes `$variable_name` placeholders in string values throughout the IR.
 * Returns a new IR with all matching variables replaced. Unmatched variables are left as-is.
 */
export function interpolateVariables(ir: QueryIR, vars: VariableMap): QueryIR {
  return JSON.parse(JSON.stringify(ir), (_key, value) => {
    if (typeof value !== 'string') return value;
    return value.replace(VARIABLE_PATTERN, (match, name: string) => {
      if (name in vars) {
        const v = vars[name];
        return v === null ? 'null' : String(v);
      }
      return match;
    });
  }) as QueryIR;
}

/**
 * Extracts all variable names (without $) referenced in the IR.
 */
export function extractVariables(ir: QueryIR): string[] {
  const json = JSON.stringify(ir);
  const vars = new Set<string>();
  const pattern = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(json)) !== null) {
    if (match[1]) vars.add(match[1]);
  }
  return [...vars];
}

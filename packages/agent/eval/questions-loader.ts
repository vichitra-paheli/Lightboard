/**
 * Minimal YAML loader for `questions.yaml`. Supports exactly the subset the
 * eval harness needs — no anchors, no block scalars, no flow collections:
 *
 *   - slug: foo
 *     question: Some prompt text
 *     dataSource: cricket
 *     expect:
 *       chart: line
 *       hasCaveat: true
 *
 * Added to avoid pulling in `yaml` / `js-yaml` just for one file. If the
 * seed set ever grows to need richer YAML, swap this out for a real parser.
 */

import { promises as fs } from 'node:fs';

import type { QuestionExpect } from './scoring';

/** One entry from questions.yaml. */
export interface EvalQuestion {
  slug: string;
  question: string;
  dataSource: string;
  expect?: QuestionExpect;
}

/**
 * Load and parse the questions YAML file at `path`. Throws with a clear
 * message if the file is unreadable, malformed, or missing required fields.
 */
export async function loadQuestions(path: string): Promise<EvalQuestion[]> {
  const raw = await fs.readFile(path, 'utf8');
  return parseQuestionsYaml(raw);
}

/**
 * Parse the known YAML subset into typed question entries. Exposed for tests.
 * Accepts the exact shape produced by `questions.yaml` — one top-level
 * sequence with scalar + one optional nested `expect:` mapping per item.
 */
export function parseQuestionsYaml(source: string): EvalQuestion[] {
  const lines = source.split(/\r?\n/);
  const questions: EvalQuestion[] = [];

  let current: Partial<EvalQuestion> | null = null;
  let inExpect = false;

  const pushCurrent = (): void => {
    if (!current) return;
    if (!current.slug || !current.question || !current.dataSource) {
      throw new Error(
        `Invalid questions.yaml entry — slug, question, and dataSource are required. Got: ${JSON.stringify(current)}`,
      );
    }
    questions.push(current as EvalQuestion);
    current = null;
    inExpect = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const line = stripComments(rawLine);
    if (line.trim().length === 0) continue;

    // Top-level entry start: `- slug: foo` or `- key: value` (unindented `-`).
    if (/^-\s+/.test(line)) {
      pushCurrent();
      current = {};
      inExpect = false;
      const after = line.replace(/^-\s+/, '');
      assignScalar(current, after, i + 1);
      continue;
    }

    // Nested lines must belong to the current entry.
    if (!current) {
      throw new Error(`questions.yaml: stray line at ${i + 1}: "${rawLine}"`);
    }

    // `expect:` header.
    if (/^\s{2}expect\s*:\s*$/.test(line)) {
      current.expect = {};
      inExpect = true;
      continue;
    }

    // Indented `expect` children: 4-space indent.
    if (inExpect && /^\s{4}\S/.test(line)) {
      assignExpectScalar(current.expect!, line.trim(), i + 1);
      continue;
    }

    // Normal entry field at 2-space indent.
    if (/^\s{2}\S/.test(line)) {
      inExpect = false;
      assignScalar(current, line.trim(), i + 1);
      continue;
    }

    throw new Error(`questions.yaml: unexpected indentation at line ${i + 1}: "${rawLine}"`);
  }

  pushCurrent();
  return questions;
}

/** Strip inline comments starting with an unquoted `#`. Keeps `#` inside quotes. */
function stripComments(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i).trimEnd();
  }
  return line;
}

/** Parse a `key: value` line into a scalar entry field. */
function assignScalar(target: Partial<EvalQuestion>, kv: string, line: number): void {
  const m = kv.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
  if (!m) throw new Error(`questions.yaml: bad scalar at line ${line}: "${kv}"`);
  const key = m[1];
  const value = stripQuotes(m[2] ?? '');
  switch (key) {
    case 'slug':
      target.slug = value;
      break;
    case 'question':
      target.question = value;
      break;
    case 'dataSource':
      target.dataSource = value;
      break;
    default:
      throw new Error(`questions.yaml: unknown field "${key}" at line ${line}`);
  }
}

/** Parse a `key: value` line into an `expect` sub-field (scalar or boolean). */
function assignExpectScalar(target: QuestionExpect, kv: string, line: number): void {
  const m = kv.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
  if (!m) throw new Error(`questions.yaml: bad expect entry at line ${line}: "${kv}"`);
  const key = m[1];
  const rawValue = (m[2] ?? '').trim();
  const boolVal = rawValue === 'true' ? true : rawValue === 'false' ? false : undefined;
  const value = stripQuotes(rawValue);
  switch (key) {
    case 'chart':
      target.chart = value;
      break;
    case 'hasCaveat':
      target.hasCaveat = boolVal ?? undefined;
      break;
    case 'multiSeries':
      target.multiSeries = boolVal ?? undefined;
      break;
    case 'hasSchemaDoc':
      target.hasSchemaDoc = boolVal ?? undefined;
      break;
    default:
      throw new Error(`questions.yaml: unknown expect field "${key}" at line ${line}`);
  }
}

/** Remove wrapping single/double quotes from a scalar value, if present. */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

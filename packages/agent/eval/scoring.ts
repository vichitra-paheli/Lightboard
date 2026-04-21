/**
 * Eval-harness scoring helpers. Pure functions: no I/O, no LLM calls, no
 * clock access. The harness feeds recorded {@link AgentEvent} streams + the
 * last view HTML + any `narrate_summary` payload in; a typed
 * {@link QuestionSummary} comes out.
 *
 * Kept separate from `harness.ts` so unit tests can exercise the scoring
 * logic without spinning up Postgres or an LLM endpoint.
 */

import type { AgentEvent } from '../src/agent';
import type { ToolKind } from '../src/events/tool-event-formatter';

/** Expected keys from a question's `expect:` block in questions.yaml. */
export interface QuestionExpect {
  /** Expected chart type hint, e.g. `horizontal_bar`, `line`. Loose match. */
  chart?: string;
  /** Narrate should include a caveat. */
  hasCaveat?: boolean;
  /** View should render multiple series. */
  multiSeries?: boolean;
  /** Bootstrap sentinel: scored against H3-section presence. */
  hasSchemaDoc?: boolean;
}

/** Per-question pass/fail record emitted by the harness. */
export interface QuestionSummary {
  slug: string;
  question: string;
  durationMs: number;
  /** Real value if the provider exposes `usage`, else char/4 estimate. */
  tokenEstIn: number;
  tokenEstOut: number;
  /** Set to `true` when token counts come from actual provider usage. */
  tokenExact: boolean;
  toolCallCount: number;
  /** Per-kind tallies from `classifyTool`, e.g. `{ SCHEMA: 2, QUERY: 3 }`. */
  kinds: Record<string, number>;
  hasView: boolean;
  hasKeyTakeaways: boolean;
  hasCaveat: boolean;
  /** True only for the schema-doc bootstrap sentinel when all 8 H3 sections are present. */
  hasSchemaDoc: boolean;
  /** Inferred chart kind from view HTML, e.g. `bar`, `line`, `donut`. */
  chartType?: string;
  /** Non-fatal errors collected during the run. */
  errors: string[];
  /** Echoed from the leader `done` event. */
  stopReason?: string;
  /** Loose expected shape from the question entry (pass-through for diffing). */
  expect?: QuestionExpect;
}

/** Minimal shape of a `create_view`/`modify_view` tool_end payload. */
export interface ViewToolPayload {
  html?: string;
}

/** Minimal shape of a `narrate_summary` tool_end payload. */
export interface NarratePayload {
  bullets?: unknown[];
  caveat?: string;
}

/** Inputs to {@link scoreQuestion}. Keep this pure — no async, no side effects. */
export interface ScoringInputs {
  slug: string;
  question: string;
  events: AgentEvent[];
  /** Final `create_view`/`modify_view` HTML if any. */
  viewHtml?: string;
  /** Structured payload from the last `narrate_summary` tool_end, if any. */
  narrate?: NarratePayload;
  /** Rendered schema-doc markdown (bootstrap sentinel only). */
  schemaDoc?: string;
  /** Wall-clock duration in ms. */
  durationMs: number;
  /** Real token counts if provider emitted `usage`. */
  usage?: { input?: number; output?: number };
  /** Per-question expectations from questions.yaml (pass-through). */
  expect?: QuestionExpect;
  /** Fatal errors aggregated outside the agent stream (endpoint down, etc). */
  harnessErrors?: string[];
}

/**
 * H3 section headings required by the schema-doc bootstrap flow. When all
 * eight are present (case-insensitive, `### ` prefix), the bootstrap output
 * is scored as passing.
 */
export const REQUIRED_SCHEMA_DOC_SECTIONS = [
  'Tables',
  'Key Join Patterns',
  'Useful Enumerations',
  'Derived Metrics',
  'Semantic Dictionary',
  'Implicit Filters',
  'Gotchas',
  'Example Queries',
];

/**
 * Estimate token count from character length. Used as a fallback when the
 * provider does not expose real `usage` figures. The `/4` heuristic is the
 * same one used throughout the OpenAI ecosystem for rough ballpark sizing.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

/**
 * Infer a chart kind from the final view HTML. Looks for Chart.js `type:`
 * declarations first (canonical), then common CSS class hints, and finally
 * falls back to `undefined`.
 */
export function inferChartType(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const lower = html.toLowerCase();

  // Chart.js: `type: 'bar'` / `type: "line"` / `type:bar`.
  const chartJsMatch = lower.match(/type\s*:\s*['"]?([a-z_-]+)['"]?/);
  if (chartJsMatch && chartJsMatch[1]) {
    const kind = chartJsMatch[1];
    // Restrict to a known Chart.js set so we don't false-positive on e.g.
    // `type: number` in inline JS.
    if (KNOWN_CHART_TYPES.has(kind)) return kind;
  }

  // Explicit design-system hints: fig--bar / fig--horizontal-bar / fig--line.
  const classMatch = lower.match(/class=['"][^'"]*fig--?([a-z-]+)/);
  if (classMatch && classMatch[1]) {
    return classMatch[1];
  }

  // SVG fallback — look for tokens the design snippets use.
  if (lower.includes('fig__bar')) return 'bar';
  if (lower.includes('fig__line') || lower.includes('<polyline')) return 'line';
  if (lower.includes('fig__donut') || lower.includes('pie')) return 'donut';
  if (lower.includes('fig__stat')) return 'stat';

  return undefined;
}

/** Chart.js kinds we recognize from `type:` — guards against false positives. */
const KNOWN_CHART_TYPES = new Set([
  'bar',
  'line',
  'pie',
  'doughnut',
  'donut',
  'radar',
  'polararea',
  'scatter',
  'bubble',
  'area',
  'horizontalbar',
  'horizontal_bar',
  'stat',
]);

/**
 * Score a single question run into a {@link QuestionSummary}. Pure — all the
 * async plumbing lives in the harness. Keeps the tests trivial.
 */
export function scoreQuestion(inputs: ScoringInputs): QuestionSummary {
  const { slug, question, events, viewHtml, narrate, schemaDoc, durationMs, usage, expect, harnessErrors } = inputs;

  const errors: string[] = [...(harnessErrors ?? [])];
  let stopReason: string | undefined;
  let toolCallCount = 0;
  const kinds: Record<string, number> = {};
  let hasView = false;

  for (const event of events) {
    switch (event.type) {
      case 'tool_end': {
        toolCallCount += 1;
        const kind = event.kind as ToolKind | undefined;
        if (kind) {
          kinds[kind] = (kinds[kind] ?? 0) + 1;
        }
        if (event.isError) {
          errors.push(`tool "${event.name}" failed: ${truncate(event.result, 200)}`);
        }
        if (!event.isError && (event.name === 'create_view' || event.name === 'modify_view')) {
          hasView = true;
        }
        // View agents return their HTML via `await_tasks`, not create_view —
        // watch for that too so dispatch-pattern questions score correctly.
        if (!event.isError && event.name === 'await_tasks' && eventResultContainsViewHtml(event.result)) {
          hasView = true;
        }
        break;
      }
      case 'done':
        stopReason = event.stopReason;
        break;
      default:
        break;
    }
  }

  // If we recorded a viewHtml payload out-of-band, treat the question as
  // having produced a view even if the tool-end scrape missed it.
  if (viewHtml && viewHtml.length > 0) {
    hasView = true;
  }

  const narrateBullets = Array.isArray(narrate?.bullets) ? narrate!.bullets : [];
  const hasKeyTakeaways = narrateBullets.length === 3;
  const caveatStr = typeof narrate?.caveat === 'string' ? narrate!.caveat.trim() : '';
  const hasCaveat = caveatStr.length > 0;

  const chartType = inferChartType(viewHtml);

  const schemaDocOk = isSchemaDocComplete(schemaDoc);

  const tokenExact = typeof usage?.input === 'number' && typeof usage?.output === 'number';
  const tokenEstIn = tokenExact ? usage!.input! : estimateTokens(charCountForInput(events, question));
  const tokenEstOut = tokenExact ? usage!.output! : estimateTokens(charCountForOutput(events, viewHtml, narrate));

  return {
    slug,
    question,
    durationMs,
    tokenEstIn,
    tokenEstOut,
    tokenExact,
    toolCallCount,
    kinds,
    hasView,
    hasKeyTakeaways,
    hasCaveat,
    hasSchemaDoc: schemaDocOk,
    ...(chartType ? { chartType } : {}),
    errors,
    ...(stopReason ? { stopReason } : {}),
    ...(expect ? { expect } : {}),
  };
}

/**
 * Check whether a markdown document contains every required H3 section for
 * a complete schema-doc bootstrap result. Returns `false` if the input is
 * missing, empty, or short even one section.
 */
export function isSchemaDocComplete(doc: string | undefined): boolean {
  if (!doc || doc.length === 0) return false;
  const lower = doc.toLowerCase();
  for (const section of REQUIRED_SCHEMA_DOC_SECTIONS) {
    const heading = `### ${section.toLowerCase()}`;
    if (!lower.includes(heading)) return false;
  }
  return true;
}

/** Best-effort check that an `await_tasks` payload carries a view result. */
function eventResultContainsViewHtml(raw: string): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const value of Object.values(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      if (v.role !== 'view' || v.success !== true) continue;
      const data = v.data as Record<string, unknown> | undefined;
      if (!data) continue;
      const spec = (data.viewSpec as Record<string, unknown> | undefined) ?? data;
      if (spec && typeof spec.html === 'string' && spec.html.length > 0) return true;
      if (spec && typeof spec.viewId === 'string' && spec.viewId.length > 0) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/** Rough char-based input size: the user's question + tool-call inputs. */
function charCountForInput(events: AgentEvent[], question: string): number {
  let chars = question.length;
  for (const event of events) {
    if (event.type === 'tool_end') {
      // Tool inputs are already captured inside the result payload for log
      // purposes; don't double-count them.
      continue;
    }
  }
  return chars;
}

/** Rough char-based output size: agent text + view HTML + narrate bullets. */
function charCountForOutput(
  events: AgentEvent[],
  viewHtml: string | undefined,
  narrate: NarratePayload | undefined,
): number {
  let chars = 0;
  for (const event of events) {
    if (event.type === 'text') {
      chars += event.text.length;
    }
  }
  if (viewHtml) chars += viewHtml.length;
  if (narrate) chars += JSON.stringify(narrate).length;
  return chars;
}

/** Shorten a string to `n` characters with an ellipsis marker for log rows. */
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

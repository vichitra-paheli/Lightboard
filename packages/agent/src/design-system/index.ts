import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Chart shape hint emitted by the leader when it dispatches a view task.
 *
 * The leader infers this from the column types of the query result — see
 * `inferChartHint` in `packages/agent/src/agents/leader.ts`. The view prompt
 * uses it to pick which snippet(s) ship with the design context so the model
 * sees the closest template first.
 *
 * `'auto'` means "we couldn't tell — fall back to the canonical reference".
 */
export type ChartHint =
  | 'horizontal-bar'
  | 'vertical-bar'
  | 'line'
  | 'donut'
  | 'stat'
  | 'auto';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Read a sibling design-system asset from disk. Assets are loaded once at
 * module init (outside any hot path) so there's no IO cost per LLM call.
 */
function readAsset(relPath: string): string {
  return readFileSync(join(HERE, relPath), 'utf8');
}

/**
 * The `:root` token block the view prompt asks the model to paste verbatim at
 * the top of every generated `<style>`. Mirrored from
 * `apps/web/src/styles/globals.css` via the token-drift CI guard.
 */
export const DESIGN_TOKENS_CSS: string = readAsset('tokens.css');

/**
 * Voice and content rules the model should follow in every generated figure.
 * Roughly 30 lines — first-person, no emoji, signed deltas, tabular-nums,
 * uppercase-mono metadata.
 */
export const DESIGN_VOICE: string = readAsset('voice.md');

/**
 * Ten-item self-check the model walks before emitting HTML. Appended to the
 * end of the view prompt to force a quick review pass.
 */
export const DESIGN_RUBRIC: string = readAsset('rubric.md');

/** Canonical horizontal-bar snippet — the one every variant should resemble. */
const SNIPPET_HORIZONTAL_BAR: string = readAsset('snippets/fig-horizontal-bar.html');
const SNIPPET_VERTICAL_BAR: string = readAsset('snippets/fig-vertical-bar.html');
const SNIPPET_LINE: string = readAsset('snippets/fig-line.html');
const SNIPPET_DONUT: string = readAsset('snippets/fig-donut.html');
const SNIPPET_STAT: string = readAsset('snippets/fig-stat.html');

/**
 * Human-readable titles shown above each snippet in the design context so the
 * model knows which template it's looking at.
 */
const SNIPPET_TITLES: Record<Exclude<ChartHint, 'auto'>, string> = {
  'horizontal-bar': 'Horizontal bar (canonical reference)',
  'vertical-bar': 'Vertical bar (time-buckets, discrete periods)',
  line: 'Line + filled area (time-series)',
  donut: 'Donut + legend (parts-of-whole, <=6 slices)',
  stat: 'Single-KPI stat card',
};

/** Map a hint to its snippet. `auto` falls back to horizontal-bar. */
function snippetFor(hint: ChartHint): string {
  switch (hint) {
    case 'vertical-bar':
      return SNIPPET_VERTICAL_BAR;
    case 'line':
      return SNIPPET_LINE;
    case 'donut':
      return SNIPPET_DONUT;
    case 'stat':
      return SNIPPET_STAT;
    case 'horizontal-bar':
    case 'auto':
    default:
      return SNIPPET_HORIZONTAL_BAR;
  }
}

/** Format a snippet as a fenced HTML block with a human title above it. */
function formatSnippet(title: string, snippet: string): string {
  return `### ${title}\n\n\`\`\`html\n${snippet}\n\`\`\``;
}

/**
 * Assemble the chart-component section of the view system prompt for a given
 * chart hint. Shape: one or two snippet templates, with the horizontal-bar
 * canonical always present so the model has a stable reference.
 *
 * Budget: target ~2.6k tokens total (voice + tokens + 1-2 snippets + rubric).
 * Capped at two snippets to stay honest against the budget.
 */
export function buildDesignContext(hint: ChartHint): string {
  // 'auto' → include the canonical (horizontal-bar) plus the stat card so the
  // two most common shapes (ranked comparison, single KPI) are covered.
  if (hint === 'auto') {
    return [
      formatSnippet(SNIPPET_TITLES['horizontal-bar'], SNIPPET_HORIZONTAL_BAR),
      formatSnippet(SNIPPET_TITLES.stat, SNIPPET_STAT),
    ].join('\n\n');
  }

  // If the hint IS horizontal-bar, don't duplicate it. Otherwise, include the
  // requested snippet first (so it's primed in the model's attention) and the
  // canonical second as a reference.
  if (hint === 'horizontal-bar') {
    return formatSnippet(SNIPPET_TITLES['horizontal-bar'], SNIPPET_HORIZONTAL_BAR);
  }

  return [
    formatSnippet(SNIPPET_TITLES[hint], snippetFor(hint)),
    formatSnippet(SNIPPET_TITLES['horizontal-bar'], SNIPPET_HORIZONTAL_BAR),
  ].join('\n\n');
}

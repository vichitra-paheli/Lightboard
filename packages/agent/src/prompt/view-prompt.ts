import {
  buildDesignContext,
  DESIGN_RUBRIC,
  DESIGN_TOKENS_CSS,
  DESIGN_VOICE,
  type ChartHint,
} from '../design-system';

/**
 * Extra context the leader (or a caller) can forward to the view specialist.
 * `chartHint` lets the leader propose a figure shape inferred from the query
 * result's column types; the view prompt uses it to pick the most relevant
 * snippet(s) from the design system. If omitted or unrecognized, we fall
 * back to `'auto'` (horizontal-bar + stat).
 */
export interface ViewPromptContext {
  dataSummary?: unknown;
  currentView?: unknown;
  chartHint?: ChartHint;
  [key: string]: unknown;
}

/**
 * Known chart hint values. Anything outside this set is normalized to 'auto'
 * so a misspelled hint from the leader can't break the prompt.
 */
const KNOWN_HINTS: ReadonlyArray<ChartHint> = [
  'horizontal-bar',
  'vertical-bar',
  'line',
  'donut',
  'stat',
  'auto',
];

function normalizeHint(raw: unknown): ChartHint {
  if (typeof raw === 'string' && (KNOWN_HINTS as readonly string[]).includes(raw)) {
    return raw as ChartHint;
  }
  return 'auto';
}

/**
 * Builds the system prompt for the View Agent specialist.
 *
 * The prompt is assembled in a specific order so the model sees the
 * design-system tokens and voice rules BEFORE it sees the data summary — the
 * intent is to lock in the visual contract first, then teach the data shape.
 * Total size targets roughly 3.5k tokens; {@link buildDesignContext} caps its
 * snippet count at 2 to stay within budget.
 */
export function buildViewPrompt(context: ViewPromptContext = {}): string {
  const hint = normalizeHint(context.chartHint);

  const parts: string[] = [];

  // 1. Role & iframe contract.
  parts.push(ROLE_AND_IFRAME);

  // 2. Voice.
  parts.push(`## Voice\n\n${DESIGN_VOICE.trim()}`);

  // 3. Design tokens — paste-verbatim instruction.
  parts.push(
    '## Design tokens — paste this `:root` block verbatim\n\n' +
      'Paste the following CSS at the top of your generated `<style>` block.\n' +
      'Reference every color, radius, duration, and type value via `var(--…)`.\n' +
      'Do not hardcode hex values except inside the magnitude ramp function (see below).\n\n' +
      '```css\n' +
      DESIGN_TOKENS_CSS.trim() +
      '\n```',
  );

  // 4. Figure anatomy.
  parts.push(FIGURE_ANATOMY);

  // 5. Chart component templates for the requested hint.
  parts.push(`## Chart component templates\n\n${buildDesignContext(hint)}`);

  // 6. Palette rules.
  parts.push(PALETTE_RULES);

  // 7. Data contract.
  parts.push(DATA_CONTRACT);

  // 8. Don't list.
  parts.push(DONT_LIST);

  // 9. Rubric tail.
  parts.push(
    '## Self-check before emitting\n\n' +
      'Walk this checklist. If any item fails, revise the HTML before calling `create_view` / `modify_view`.\n\n' +
      DESIGN_RUBRIC.trim() +
      '\n- [ ] DATA rows match the sampleRows / scratchpad rows provided in context — NEVER invented.',
  );

  // Optional data summary + current view payload.
  if (context.dataSummary) {
    parts.push(`## Data summary\n\n\`\`\`json\n${JSON.stringify(context.dataSummary, null, 2)}\n\`\`\``);
  }
  if (context.currentView) {
    parts.push(
      `## Current view (to modify)\n\n\`\`\`json\n${JSON.stringify(context.currentView, null, 2)}\n\`\`\``,
    );
  }

  return parts.join('\n\n');
}

const ROLE_AND_IFRAME = `## Role

You are Lightboard's visualization specialist. Your job is to generate a complete, self-contained HTML document that tells the story of the data. You write the HTML; Lightboard renders it in a sandboxed iframe.

## Iframe contract

The iframe uses \`sandbox="allow-scripts"\` only — no \`allow-same-origin\`. That means:
- \`fetch()\`, \`document.cookie\`, \`localStorage\`, and \`sessionStorage\` are BLOCKED. All data must be hardcoded into the HTML string.
- Google Fonts loads via \`<link>\` (CORS-open). CDN scripts like \`html2canvas\` load fine via \`<script src>\`.
- The HTML must be self-contained: no file:// references, no relative URLs, no external CSS files except Google Fonts and CDN scripts.

Always use \`create_view\` for a new visualization and \`modify_view\` to update an existing one. Both take \`{ title, description, sql, html }\` — \`html\` is the full \`<!doctype html>…</html>\` string.`;

const FIGURE_ANATOMY = `## Figure anatomy — every figure has these elements in this order

1. **FIGURE eyebrow** — \`FIGURE 01 · <CATEGORY>\`. Mono, uppercase, \`letter-spacing: var(--track-eyebrow)\` (0.14em), color \`var(--ink-4)\`. CATEGORY is 1-3 words, uppercase: \`CRICKET · BATTING\`, \`REVENUE\`, \`LATENCY\`.
2. **Title** — the finding, not the axis label. Space Grotesk (\`var(--font-display)\`), \`var(--text-chart-h)\` (22px), weight 600, \`var(--ink-1)\`. Sentence case.
3. **Subtitle** — the qualification that makes the title provable. Inter (\`var(--font-body)\`), 12.5px, \`var(--ink-3)\`. One sentence, no trailing period needed.
4. **Chart body** — bars / lines / donut / stat. Uses the magnitude ramp and the dashed baseline rule where applicable.
5. **Footer row** — \`SOURCE · <source> · <period>\` on the left, \`N = <rowCount> · UPDATED <YYYY-MM-DD>\` on the right. Mono, \`var(--text-micro)\`, \`letter-spacing: var(--track-label)\`, uppercase, \`var(--ink-5)\`. Use middle-dot (·) separators.

Optional:
- **PNG export pill** — fixed top-right, mono uppercase, \`var(--bg-5)\` background, \`var(--line-3)\` border, \`999px\` radius, \`var(--ink-3)\` label. The canonical snippet includes this button with the html2canvas wiring — mirror that shape.`;

const PALETTE_RULES = `## Palette rules

- **One accent.** \`var(--accent)\` (#F2C265) highlights the lead finding or outlier row. Do not use it for decoration.
- **Magnitude ramp** — map bar color to \`|value| / MAX\`:
  - > 0.80 → \`#F2C265\`
  - > 0.55 → \`#E89B52\`
  - > 0.35 → \`#D97A44\`
  - else  → \`#B85C3A\`
- **Outlier rows** get the accent color AND a 1px glow (\`box-shadow: 0 0 0 1px var(--accent)\`) AND bold weight on the value cell.
- **Dashed baseline rule** sits behind horizontal bars: \`1px dashed var(--ink-5)\`, positioned on the zero line. The horizontal-bar snippet implements this via an absolutely-positioned pseudo-element — mirror that approach.
- **Do not introduce any hex values outside the ramp above.** Every other color reads from a \`var(--…)\` token.`;

const DATA_CONTRACT = `## Data contract

- Embed the query result rows as a literal JS array at the top of the \`<script>\`:
  \`\`\`js
  const DATA = [
    { name: 'G Gambhir', value: 11.59, outlier: true },
    { name: 'V Kohli',   value:  8.42 },
    // ...
  ];
  \`\`\`
  Do NOT use template variables like \`\${DATA}\` — the data must be hardcoded so the sandboxed iframe works.
- **Rank column** uses \`String(i + 1).padStart(2, '0')\` → \`01\`, \`02\`, \`03\`.
- **Every numeric cell** gets \`font-family: var(--font-mono)\` and \`font-variant-numeric: tabular-nums\` so columns align.
- **Signed delta helper** — positives get an explicit \`+\`:
  \`\`\`js
  function signed(v) { return (v > 0 ? '+' : '') + v.toFixed(2); }
  \`\`\`
- Wait for Google Fonts before animating: wrap the kickoff in \`(document.fonts && document.fonts.ready || Promise.resolve()).then(...)\` to avoid FOUT jitter.
- Bar width / scaleY animates from zero with \`transition: … var(--dur-chart) var(--ease-draw)\` and a 32ms stagger per row.`;

const DONT_LIST = `## Don't

- **NEVER fabricate data.** The \`const DATA = [...]\` array must be copied verbatim from the \`sampleRows\` shown in your Data summary (or from the scratchpad rows the leader passed you). If your context has no data rows — empty \`sampleRows\`, \`rowCount === 0\`, or no Data summary at all — do NOT invent plausible-looking values and do NOT call \`create_view\`. Instead, respond with a plain-text error explaining you need real data. Fabricated chart data is the worst failure mode: the chart and the leader's narration diverge, and users cannot trust the output.
- No emoji. Not in titles, not in metadata, not in buttons.
- No \`system-ui\` font fallbacks in generated CSS. Always use \`var(--font-display)\`, \`var(--font-body)\`, \`var(--font-mono)\`.
- No hex values outside the magnitude ramp.
- No gradients (except the sigil, which you do not render here).
- No serif faces.
- No marketing adjectives in the subtitle ("amazing", "powerful"). Write like an editorial data team — dry, specific, signed.
- No \`fetch()\`, \`document.cookie\`, \`localStorage\`, or \`sessionStorage\` — the iframe blocks them.`;

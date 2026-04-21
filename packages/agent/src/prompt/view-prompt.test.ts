import { describe, expect, it } from 'vitest';

import { buildViewPrompt } from './view-prompt';

describe('buildViewPrompt', () => {
  it('asserts the figure anatomy vocabulary', () => {
    const prompt = buildViewPrompt({ chartHint: 'horizontal-bar' });
    expect(prompt).toContain('FIGURE');
    expect(prompt).toContain('Space Grotesk');
    expect(prompt).toContain('tabular-nums');
    expect(prompt).toContain('SOURCE');
    expect(prompt).toContain('--accent');
  });

  it('includes the horizontal-bar snippet when asked', () => {
    const prompt = buildViewPrompt({ chartHint: 'horizontal-bar' });
    expect(prompt).toContain('Horizontal bar (canonical reference)');
    // The snippet's signed-delta helper is embedded as code.
    expect(prompt).toContain("String(i + 1).padStart(2, '0')");
  });

  it('includes both canonical + stat for the auto hint', () => {
    const prompt = buildViewPrompt({ chartHint: 'auto' });
    expect(prompt).toContain('Horizontal bar (canonical reference)');
    expect(prompt).toContain('Single-KPI stat card');
  });

  it('falls back to auto when no hint is provided', () => {
    const prompt = buildViewPrompt();
    expect(prompt).toContain('Horizontal bar (canonical reference)');
    expect(prompt).toContain('Single-KPI stat card');
  });

  it('normalizes unknown hint values to auto', () => {
    const prompt = buildViewPrompt({ chartHint: 'unknown-shape' as never });
    expect(prompt).toContain('Horizontal bar (canonical reference)');
    expect(prompt).toContain('Single-KPI stat card');
  });

  it('pairs line hint with the horizontal-bar canonical reference', () => {
    const prompt = buildViewPrompt({ chartHint: 'line' });
    expect(prompt).toContain('Line + filled area');
    expect(prompt).toContain('Horizontal bar (canonical reference)');
  });

  it('does NOT include the old indigo palette', () => {
    // Regression guard: the old prompt hardcoded #6366f1 as the accent.
    for (const hint of ['horizontal-bar', 'line', 'donut', 'stat', 'auto', 'vertical-bar'] as const) {
      const prompt = buildViewPrompt({ chartHint: hint });
      expect(prompt, `hint=${hint}`).not.toContain('#6366f1');
    }
  });

  it('does NOT include the old hardcoded #0a0a0f background', () => {
    for (const hint of ['horizontal-bar', 'line', 'donut', 'stat', 'auto', 'vertical-bar'] as const) {
      const prompt = buildViewPrompt({ chartHint: hint });
      expect(prompt, `hint=${hint}`).not.toContain('#0a0a0f');
    }
  });

  it('does NOT mandate system-ui fonts anywhere', () => {
    // The old prompt said "system-ui font stack." — that's off-brand.
    // Generated CSS inside snippets may legitimately use system-ui as a fallback
    // tail on font-family declarations (e.g. inside `<link>`-less contexts),
    // so we only guard the parts of the prompt that are Lightboard-authored
    // prose, not the code blocks.
    const prompt = buildViewPrompt({ chartHint: 'horizontal-bar' });
    // No "system-ui font stack" instruction anywhere.
    expect(prompt).not.toMatch(/system-ui font stack/i);
    // No "use system-ui" instruction.
    expect(prompt).not.toMatch(/use system-ui/i);
  });

  it('carries a current-view payload when provided', () => {
    const prompt = buildViewPrompt({
      chartHint: 'horizontal-bar',
      currentView: { title: 'Existing chart', html: '<html></html>' },
    });
    expect(prompt).toContain('Current view (to modify)');
    expect(prompt).toContain('Existing chart');
  });

  it('emits a data summary block when provided', () => {
    const prompt = buildViewPrompt({
      chartHint: 'horizontal-bar',
      dataSummary: { columns: ['name', 'value'], rowCount: 5 },
    });
    expect(prompt).toContain('Data summary');
    expect(prompt).toContain('rowCount');
  });

  it('includes the never-fabricate-data directive across all hints (issue #108)', () => {
    for (const hint of ['horizontal-bar', 'line', 'donut', 'stat', 'auto', 'vertical-bar'] as const) {
      const prompt = buildViewPrompt({ chartHint: hint });
      expect(prompt, `hint=${hint}`).toMatch(/NEVER fabricate data/);
      // The rubric checklist line must also be present.
      expect(prompt, `hint=${hint}`).toMatch(
        /DATA rows match the sampleRows \/ scratchpad rows provided in context/,
      );
    }
  });

  it('keeps the total length within a sane budget', () => {
    // Tokens (~2.8k), voice (~0.7k), rubric (~0.3k), one snippet (~6k), plus
    // the prose wrapper brings horizontal-bar in around 17k chars. Two-snippet
    // variants climb higher. The ceiling is a smoke test — the real budget
    // lives in the snippet + voice + rubric file sizes, which have their own
    // drift guards. 22k gives headroom for minor prose tweaks without the
    // tests flaring.
    const prompt = buildViewPrompt({ chartHint: 'horizontal-bar' });
    expect(prompt.length).toBeLessThan(22_000);
    const autoPrompt = buildViewPrompt({ chartHint: 'auto' });
    expect(autoPrompt.length).toBeLessThan(22_000);
  });
});

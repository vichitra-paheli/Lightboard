import { describe, expect, it } from 'vitest';

import {
  buildDesignContext,
  DESIGN_RUBRIC,
  DESIGN_TOKENS_CSS,
  DESIGN_VOICE,
} from '../index';

describe('design-system/index', () => {
  describe('DESIGN_TOKENS_CSS', () => {
    it('exposes the :root token block', () => {
      expect(DESIGN_TOKENS_CSS).toContain(':root');
      expect(DESIGN_TOKENS_CSS).toContain('--ink-1');
      expect(DESIGN_TOKENS_CSS).toContain('--accent');
      expect(DESIGN_TOKENS_CSS).toContain('--bg-0');
      expect(DESIGN_TOKENS_CSS).toContain('--font-display');
    });

    it('includes the editorial warm amber accent', () => {
      expect(DESIGN_TOKENS_CSS).toContain('#F2C265');
      expect(DESIGN_TOKENS_CSS).toContain('#E89B52');
    });

    it('does not ship the drifted indigo palette', () => {
      // #6366f1 is the old generic Tailwind-indigo accent — the design kit
      // replaced it with the amber ramp. If anyone adds it back, fail loud.
      expect(DESIGN_TOKENS_CSS).not.toContain('#6366f1');
    });
  });

  describe('DESIGN_VOICE', () => {
    it('is short (~30 lines) and covers the key rules', () => {
      const lines = DESIGN_VOICE.trim().split(/\r?\n/);
      expect(lines.length).toBeLessThanOrEqual(80);
      expect(DESIGN_VOICE).toMatch(/first.person/i);
      expect(DESIGN_VOICE).toMatch(/no emoji/i);
      expect(DESIGN_VOICE).toMatch(/\+/); // signed deltas
      expect(DESIGN_VOICE).toMatch(/tabular-nums/);
    });
  });

  describe('DESIGN_RUBRIC', () => {
    it('enumerates ten checklist items', () => {
      const boxes = DESIGN_RUBRIC.match(/- \[ \]/g) ?? [];
      expect(boxes.length).toBe(10);
      expect(DESIGN_RUBRIC).toMatch(/FIGURE/);
      expect(DESIGN_RUBRIC).toMatch(/tabular-nums/);
      expect(DESIGN_RUBRIC).toMatch(/signed/i);
    });
  });

  describe('buildDesignContext', () => {
    it('includes the horizontal-bar snippet when hint is horizontal-bar', () => {
      const ctx = buildDesignContext('horizontal-bar');
      expect(ctx).toContain('Horizontal bar');
      expect(ctx).toContain('FIGURE 01');
      expect(ctx).toContain('tabular-nums');
    });

    it('does not duplicate horizontal-bar when hint is horizontal-bar', () => {
      const ctx = buildDesignContext('horizontal-bar');
      // Only one instance of the canonical title should appear.
      const matches = ctx.match(/Horizontal bar \(canonical reference\)/g) ?? [];
      expect(matches.length).toBe(1);
    });

    it('includes horizontal-bar + stat for the auto hint', () => {
      const ctx = buildDesignContext('auto');
      expect(ctx).toContain('Horizontal bar');
      expect(ctx).toContain('Single-KPI stat card');
    });

    it('pairs line with horizontal-bar canonical', () => {
      const ctx = buildDesignContext('line');
      expect(ctx).toContain('Line + filled area');
      expect(ctx).toContain('Horizontal bar (canonical reference)');
    });

    it('pairs donut with horizontal-bar canonical', () => {
      const ctx = buildDesignContext('donut');
      expect(ctx).toContain('Donut + legend');
      expect(ctx).toContain('Horizontal bar (canonical reference)');
    });

    it('stays inside a sane snippet budget for every hint', () => {
      // A single-snippet variant (horizontal-bar) sits around 6.5k chars.
      // Two-snippet variants (auto, line, donut, stat, vertical-bar) ship the
      // canonical reference alongside the requested template and run ~12k
      // chars. 14k is headroom.
      const hints = [
        'horizontal-bar',
        'vertical-bar',
        'line',
        'donut',
        'stat',
        'auto',
      ] as const;
      for (const h of hints) {
        const ctx = buildDesignContext(h);
        expect(
          ctx.length,
          `buildDesignContext('${h}') exceeded 14000 chars (got ${ctx.length})`,
        ).toBeLessThan(14_000);
      }
    });
  });
});

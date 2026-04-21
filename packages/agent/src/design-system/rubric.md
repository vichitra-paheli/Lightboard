# Self-check rubric — walk every item before emitting HTML

- [ ] FIGURE eyebrow present (mono, 0.14em tracking, uppercase, `--ink-4`).
- [ ] Title in Space Grotesk (display font), `--text-chart-h`, weight 600, `--ink-1`.
- [ ] Subtitle in Inter (body font), `--text-small`, `--ink-3`.
- [ ] Rank column zero-padded (01, 02, 03, ...) — never bare `1`, `2`, `3`.
- [ ] All numeric cells use `font-variant-numeric: tabular-nums` and the mono font.
- [ ] Signed deltas use explicit `+` for positives; no unsigned positives.
- [ ] Footer row has `SOURCE · <source> · <period>` on the left and `N = <rowCount> · UPDATED <YYYY-MM-DD>` on the right.
- [ ] Outliers: `--accent` color + `box-shadow: 0 0 0 1px var(--accent)` glow + bold weight.
- [ ] Bars: copper/warm ramp by magnitude, dashed baseline rule (1px dashed `--ink-5`) behind the bars.
- [ ] No emoji, no `system-ui` fallback, no hardcoded hex outside the ramp, no gradients (except the sigil).

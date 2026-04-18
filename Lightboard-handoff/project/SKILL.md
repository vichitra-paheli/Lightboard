---
name: lightboard-design
description: Use this skill to generate well-branded interfaces and assets for Lightboard, an AI-native data exploration and visualization platform. Contains design guidelines, tokens, the Lightboard sigil, and UI components for prototyping or production work.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

Key files:
- `README.md` — content fundamentals, visual foundations, motion, iconography, chart rules
- `colors_and_type.css` — all design tokens (surfaces, ink, accent, kinds, spacing, radii, shadow, motion)
- `components/` — React/JSX: `Wordmark.jsx` (sigil), `Chart.jsx`, `AgentTrace.jsx`, `Filmstrip.jsx`, `Shell.jsx`, `Thread.jsx`
- `Lightboard Explore.html` — the canonical surface; use as a visual reference

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and produce static HTML. If working on production code, read the tokens and rules here to become an expert in Lightboard's visual language.

Core rules to preserve:
- True-black editorial canvas; surfaces stepped via the `--bg-0..7` ladder, never gradients
- One accent only (warm amber). Tool-call kinds are the only multi-hue exception
- Space Grotesk for display, Inter for body, JetBrains Mono for metadata/numbers
- Subtle motion (150–260ms ease-out-quint); the sigil draw-in is the one allowed flourish
- Charts always carry eyebrow + headline + subtitle + footnote row; numbered-rank column; tabular-nums
- Never use emoji; Unicode glyphs only for keyboard microcopy

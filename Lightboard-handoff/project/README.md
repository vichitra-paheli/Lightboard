# Lightboard Design System

**Lightboard** is an AI-native data exploration and visualization platform. Users connect databases, ask questions in natural language, and get polished, editorialized, interactive charts. Charts can be saved as views, composed into dashboards, and shared with access control.

The product's core promise is **smoothness** — going from a raw database to an amazing visualization in one fluid motion. The design system exists to encode that smoothness into surfaces, motion, and editorial craft.

## Sources

This system was derived from the designed **Explore** page (`Lightboard Explore.html`) and its components in `components/`. There is no external Figma or legacy codebase referenced.

## Index

| File | Purpose |
|---|---|
| `README.md` | This file. System overview + fundamentals. |
| `colors_and_type.css` | Design tokens — colors, type, spacing, motion. |
| `components/` | JSX implementations used by Explore. |
| `assets/` | Logo / sigil variants. |
| `preview/` | Small HTML cards populating the Design System tab. |
| `ui_kits/explore/` | Explore UI kit (interactive recreation). |
| `SKILL.md` | Agent-skill manifest. |

---

## Content fundamentals

Lightboard's voice is **confident, editorial, and plainly technical** — the product is for data-literate people, so it doesn't hedge or over-explain. Imagine NYT data journalism rewritten for an interactive tool.

- **Headlines** are sentence-case, declarative. "Post 2014 IPL True Strike Rate." "Top TSR players (first cut)."
- **Agent voice** is first-person, direct, thoughtful. It narrates what it's doing ("I'll compute True Strike Rate as xRuns − actual runs…") and ends with a clear next-step hook ("Want me to flip the formula…?"). Emojis are **never used**.
- **Metadata copy** (source lines, tool names, footnotes) is **uppercase JetBrains Mono** with 0.14em tracking, treated like editorial dek/byline. Example: `SOURCE · IPL BALL-BY-BALL · 2014–2024`.
- **Numbers** are always tabular-nums. Signed deltas carry explicit `+` (`+11.59`). Rank labels are zero-padded (`01`, `02`).
- **Tool-call labels** are lowercase mono (`introspect_schema`, `sql`, `rank`). Arguments appear in parens like a function signature.
- **Microcopy for keyboard hints**: uppercase mono, e.g. `⌘ ⏎ SEND   ⏎ NEWLINE`.
- **No marketing fluff** anywhere. Everything earns its place: a caption, a unit, a count, a timestamp.

---

## Visual foundations

### Canvas
A **true-black editorial canvas** (`--bg-0: #08080A`) with a layered near-black surface scale going up to `--bg-7: #18181C` for chips. Every surface in a nested layout is deliberately one step lighter than its container. The result is *depth without gradients*.

**Gradients are avoided** — the only gradient in the product is a small avatar dot (`linear-gradient(135deg,#E89B52,#B08CA8)`). The **sigil** uses per-letter flat hues, not a gradient.

### Color usage
- **Ink scale** (`--ink-1` → `--ink-6`) is used strictly by hierarchy. Primary heading = ink-1, body = ink-2, mono metadata = ink-5.
- **One accent** — warm amber (`--accent` / `--accent-warm`). It signals *active state, pinned items, outliers, the send button focus ring*. Used sparingly — a dot, a 1px border, a highlight row — never a fill.
- **Tool-call kinds** each get a flat color (`--kind-schema` teal, `--kind-query` warm, `--kind-compute` mauve, etc.). These are the only cases where multiple hues coexist in one surface.
- **Chart palette** is a warm-copper ramp (`#F2C265 → #B85C3A`). Values determine shade, not category.

### Typography
- **Display**: Space Grotesk 600, tight tracking (`-0.015em`). Used for page & chart titles.
- **Body**: Inter 400/500, 1.55–1.6 leading.
- **Mono**: JetBrains Mono 400, used for: tool-call names, numbers in charts, eyebrows, timestamps, keyboard hints, row ranks.

Alt pairings (via Tweaks): **IBM Plex Sans** (unified plex) and **Instrument Serif + Inter** (serif display + sans body, more magazine-like).

### Motion
**Subtle, smart, short.** 150–260ms `cubic-bezier(.2,.8,.2,1)` for hover/state changes. 420–720ms for chart reveal (bars slide in from 0). 900ms `cubic-bezier(.6,.1,.2,1)` for the **sigil draw-in** — the one animated moment that's allowed to linger.

- Hover: surface steps up (`bg-4 → bg-6`) + ink lifts (`ink-3 → ink-2`). No scale transforms on generic UI.
- Send button hover: `translateY(-1px)` + soft white shadow; the arrow `translateX(2px)`.
- Agent thinking: dot pulses with an amber `box-shadow` halo (`0 → 6px`).
- Tool calls stream in one at a time with 180–420ms stagger, each fading up 2px.
- **No bouncy springs, no parallax, no page transitions.**

### Borders, radii, shadows
- Borders are 1px, always `--line-1..5` (near-black ink). There are no colored borders except the amber accent ring on active/pinned items (`--accent-border`).
- Radii: 4 (chips), 6–8 (inputs, small cards), 10–12 (panels), 14 (composer, chart), 999 (pills, dots).
- Shadows: only two — `--shadow-pop` for hovered send button, `--shadow-panel` for floating Tweaks panel. Most elevation is achieved with surface color, not shadow.

### Layout
- Top bar: fixed 56px, 3-column grid (`260px 1fr 260px`) for perfect visual balance of logo / nav / account.
- Sidebar: fixed 240px, scrollable.
- Thread: centered column, `max-width: 920px`, padded 28/48.
- Filmstrip: slides in from right at 320px.
- Composer: fixed-bottom, user-resizable via drag handle (80–360px), persisted.

### Imagery
Lightboard displays **data, not imagery**. There are no photos, illustrations, or decorative shapes. The product's "imagery" is *charts*.

When placeholders are needed, draw a procedural mini-chart (see `components/Filmstrip.jsx` thumbnails).

### Iconography
- Custom inline SVGs, 11–14px, `1.1–1.3` stroke, round linecaps/joins. Currently ~dozen icons in the product (menu, filter, download, send arrow, chevron, close, nav icons, composer icons).
- **Never use emoji.** Unicode is used sparingly for keyboard glyphs (`⏎`, `⌘`, `⇧`) in mono microcopy.
- No icon font. SVGs are inline, stroke="currentColor" for color inheritance.

### Charts
The system's signature element. Rules:

1. **Numbered rank column** on the left (mono, ink-5, 01-padded).
2. **Right-aligned label column** — names, not overflowing.
3. **Bar** in the warm-copper ramp, with a **dashed vertical "baseline" rule** showing average/comparison.
4. **Right-aligned value** in mono, with explicit sign if delta.
5. **Figure caption** — mono eyebrow ("Figure 01 · Batting performance vs. model"), headline in display sans, subtitle in body.
6. **Footnote row** — mono eyebrow with source and n-count. Always present.
7. **Outliers** get `--accent` treatment: ink-1 name, accent value, 1px accent-ring shadow on bar.

---

## The Sigil

Lightboard's identity is a **ten-letter drawn wordmark** (`LIGHTBOARD`) in curated sunset-to-sea colors. Each letter is a minimal geometric path drawn with a 1.2px stroke + a 2.1px halo. On load, the strokes **draw in left-to-right** (Tron-style), staggered by 80ms per letter, 900ms total per letter.

The sigil is reusable at any size via `<LightboardSigil size={…} />`. See `components/Wordmark.jsx` and the preview card for live examples.

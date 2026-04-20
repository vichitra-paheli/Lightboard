---
name: UI polish PR stack (PR 4 → PR 10)
description: Explore + auth + shared components rebuilt across PRs 4-10 (sidebar/composer, filmstrip, parts[] reducer, suggestions, token sweep, login redesign, unified loader)
type: project
---

The UI polish stack shipped as a sequence of PRs from Q2 2026 onward:

- **PR 4** — centered thread + composer + sidebar slot (merged)
- **PR 5 redux (#90)** — replaced the legacy `content + toolCalls[]` shape with an ordered `parts[]` discriminated union on `ChatMessageData`, driven by a pure `sse-reducer`. The `{ kind: 'suggestions'; items: string[] }` variant lives in the union — it is the canonical shape for follow-up chips.
- **PR 6 (#88)** — right slide-out `FilmstripPanel`
- **PR 7 (#89)** — suggestion chips (rebased onto PR 5 redux; chips are now a `parts[]` entry, not a flat field on the message)
- **PR 8 (#91)** — sweep view-renderer React chrome to design tokens
- **PR 9 (#93)** — redesign /login + /register pages to match the handoff (full-viewport chrome, animated grid backdrop, LIGHTBOARD sigil, frosted card).
- **PR 10 (#94)** — unified `LightboardLoader` across all loading surfaces (12/14/48px) + shared `SIGIL_PALETTE` module. Reduced-motion fallback: static rainbow `#` crosshatch.

**Why:** The Explore UI was originally built against a collapsed `content + toolCalls[]` shape that lost temporal ordering of tool calls vs text. PR 5 redux is the model-layer fix; PRs 6-7 are thin UI layers on top.

**How to apply:**
- Any new streamed surface (chips, takeaways, etc.) should be a new `MessagePart` variant and feed through the `sse-reducer`, not a parallel flat field on `ChatMessageData`.
- `AssistantStream` walks `parts[]` linearly; non-streamed terminal elements (chips) live at the Turn layer after the stream.
- When a later stacked PR branches before a dependency merges, rebase it onto the updated main and rewire via parts[] rather than keeping the flat-field escape hatch.

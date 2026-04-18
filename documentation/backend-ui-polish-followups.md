# Backend follow-ups — UI polish sequence

This document tracks the backend changes that the UI polish PR sequence (PR 1 through PR 8) depends on but deliberately defers. The UI ships with visual slots, hardcoded fixtures, or query-param mocks where the backend data is not yet available. Each item below will be filed as its own GitHub issue and linked from the PR that adds the corresponding UI slot.

The UI polish plan that created this list is at `C:\Users\anura\.claude\plans\snuggly-jingling-bonbon.md`.

## 1. SSE `takeaways` event

At the end of each assistant turn that produced a chart, the leader agent should emit a structured `takeaways` event over the SSE stream:

```
event: takeaways
data: {"items": ["…", "…", "…"], "caveat"?: "…"}
```

The leader already generates a plain-text summary at the end of chart-producing turns; this ticket captures the summary in a structured form (numbered key findings plus an optional caveat string) before emitting the trailing natural-language text. The UI side (PR 5) renders a `TakeawaysBlock` component behind a `?mockTakeaways=1` query param until this event lands. Once the event ships, remove the mock and wire the block to the new SSE part kind.

## 2. SSE `suggestions` event

Immediately after the `takeaways` event (or in its place when no chart was produced), the leader should emit three to four follow-up prompt suggestions scoped to the most recent chart's dimensions and measures:

```
event: suggestions
data: {"items": ["Break down by phase of innings", "Filter to 2020 onwards", "Switch to scatter vs xRuns"]}
```

The UI (PR 7) renders these as clickable chips below each assistant turn; clicking a chip calls `handleSend(chip.text)` to start a new turn. PR 7 populates the chips from a hardcoded fixture keyed off the last `view_created` event until this event is implemented.

## 3. Editorial chart framing prompt discipline

The view-agent currently produces HTML with inconsistent structure — some charts include a figure number, some do not; the headline and subtitle treatments vary; the footnote row is sometimes missing. Update the view-agent's system prompt to require every `html` output to include, in order:

1. A figure-number eyebrow (mono, small-caps) such as `FIG. 03 · BATSMAN FORM`.
2. A display-sans headline (Space Grotesk, ~22px).
3. A body-sans subtitle (Inter, ~13px, `--ink-3`).
4. A numbered-rank column on the left for tabular/bar charts.
5. A dashed baseline rule under the chart area.
6. A mono footnote row with source attribution and sample size (`SOURCE: CRICSHEET · N = 2,418`).

Include a positive and negative example in the prompt. Do not change the tool schema — this is a prompt-only change, enforced by the editorial chart framing in the view agent's few-shot examples.

## 4. Conversation list persistence

The sidebar in PR 3 / PR 4 includes a `ConversationsList` slot, but there is no server-side source of truth for conversation titles. Either extend the existing conversation schema (`packages/db/src/schema.ts`) to store `title TEXT`, defaulting to the first user message content, or derive the list on read from `messages[0].content` joined to each conversation. Expose it as a paginated API route (`GET /api/conversations`) and cache with react-query (`staleTime: 60s`). Until this lands, the UI shows a placeholder list built from the in-memory messages of the active session.

## 5. Agent-picker wiring

The new top bar in PR 3 includes a model picker (Haiku / Sonnet / Opus pill with a status dot). The picker is currently a static placeholder. The pieces exist — `apps/web/src/components/settings/ai-model-settings.tsx` already manages the user's model configuration — but there is no runtime model-list endpoint, no selection state that the header can read, and no fast-path mutation. Add a `GET /api/ai/models` endpoint returning the list of configured models, promote the model selection to a Zustand store or server-side session cookie, and wire the header picker to read/write that state. Settings page and the header picker should reflect each other in real time.

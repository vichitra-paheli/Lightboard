# `@lightboard/agent` eval harness

A prompt-iteration tool that runs the multi-agent leader against a real
Postgres + a real LLM, one question at a time, and produces a structured
pass/fail bundle we can diff across prompt variants. **Not a CI gate** —
runs are manual.

## Run

```
LIGHTBOARD_EVAL_PG_URL=postgres://user:pass@localhost:5434/cricket \
  pnpm --filter @lightboard/agent eval \
  --endpoint=http://localhost:11434 \
  --model=qwen3.6:35b
```

Claude fallback when Ollama isn't reachable:

```
pnpm --filter @lightboard/agent eval \
  --provider=claude \
  --model=claude-sonnet-4-20250514 \
  --api-key=$ANTHROPIC_API_KEY \
  --pg-url=$LIGHTBOARD_EVAL_PG_URL
```

Subset a single question: `--only=top-batters-tsr`.
Toggle the experimental prompt: `--variant=B`.
Full flag list: `pnpm --filter @lightboard/agent eval --help`.

Exit codes: `0` if every question completed without errors, `1` if any
question recorded an error, `2` for missing required flags.

## Output layout

```
packages/agent/eval/results/<timestamp>/
├── report.json                        # run-level roll-up
└── <slug>/
    ├── events.jsonl                   # raw AgentEvent stream
    ├── log.jsonl                      # ConversationLog JSONL (SQL + tool inputs)
    ├── view.html                      # last create_view / modify_view payload
    ├── narrate.json                   # narrate_summary output (when present)
    ├── schema-doc.md                  # schema-doc bootstrap only
    └── summary.json                   # scored QuestionSummary
```

## Scoring (one line per `QuestionSummary` field)

- `durationMs` — wall-clock from dispatch to `done`.
- `tokenEstIn` / `tokenEstOut` — real if provider emits `usage`, else `chars/4`; see `tokenExact`.
- `toolCallCount` — tool_end events seen.
- `kinds` — per-kind tallies from `classifyTool` (SCHEMA, QUERY, VIZ, NARRATE, …).
- `hasView` — a `create_view` / `modify_view` succeeded OR an `await_tasks` task returned a view spec.
- `hasKeyTakeaways` — `narrate_summary` emitted exactly three bullets.
- `hasCaveat` — `narrate_summary` emitted a non-empty `caveat`.
- `hasSchemaDoc` — bootstrap only; true when all 8 H3 sections are present.
- `chartType` — inferred from Chart.js `type:` declaration or design-system class hint.
- `errors` — non-fatal errors, including failed tool calls and timeouts.
- `stopReason` — echoed from the leader `done` event.

## Add a question

Edit `questions.yaml`, add a new block:

```yaml
- slug: kebab-case-slug
  question: Natural-language prompt
  dataSource: cricket
  expect:
    chart: horizontal_bar
    hasCaveat: true
```

`expect` fields are pass-through hints — unset ones are ignored. Credentials
never live here; the harness always resolves Postgres via env.

## Diff variants

```
diff -u results/<runA>/report.json results/<runB>/report.json
```

Or compare a single question:

```
diff -u results/<runA>/<slug>/summary.json results/<runB>/<slug>/summary.json
```

Screenshot-diffing the rendered `view.html` is out of scope for now; open
the two HTML files side-by-side in a browser if you need a visual check.

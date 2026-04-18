# Learnings from CowCorner Prototype

Validated patterns from the cricket analytics chat prototype (D:\cowcorner_model\chat) that should inform the Lightboard agent.

## What Worked

### 1. Schema context is everything
The single biggest factor in query quality. A curated schema document with:
- Table names, key columns, types
- **Join patterns** (explicit: "use X.id = Y.foreign_id")
- **Enum values** with exact strings (critical — wrong enum = 0 rows = wasted round)
- **Gotchas** ("series is mostly NULL — use training_data.match_format for IPL filtering")
- **2-3 example queries** for common patterns

Without this, the agent burned 12+ rounds discovering schema quirks. With it: 2 rounds.

### 2. describe_table tool
Runtime introspection: returns column names, types, nullable, sample values, row count. The agent calls this before writing SQL for unfamiliar tables. Cheap insurance against guessing column names.

### 3. Full HTML generation > templates
Claude generates complete self-contained HTML with inline CSS/JS for every visualization. This produces dramatically better results than mapping data to chart templates. The agent composes multi-panel layouts, dual-encoded bar charts, scatter plots with annotations — compositions that no template library would produce.

### 4. Tool use loop (query → see data → design viz)
Claude needs to see the actual data before designing the visualization. A leaderboard where #1 is 40% ahead needs different framing than one where top 10 are within 2%. The tool use pattern (execute_query → examine results → generate HTML) is essential.

### 5. Minimal design checklist
Four lines in the system prompt that consistently improve viz quality:
```
After querying, before generating HTML:
1. What's the finding? (outlier, gap, cluster, trend)
2. Title = the finding, not a label
3. One enrichment: a complementary dimension that creates tension or context
4. Subtitle = qualification criteria (min threshold, date range, sample size)
```

### 6. SSE streaming for status
Users need to know what's happening during the 10-30 second wait. Streaming status updates ("Running query...", "Got 42 rows", "Generating visualization...") keeps them engaged instead of wondering if it's stuck.

### 7. Timeline filmstrip
Users iterate. Showing thumbnails of all previous visualizations lets them click back to any earlier version. Simple but essential for the exploration workflow.

## What Failed

### 1. Adaptive thinking with tool use
Claude Sonnet 4.6 with `thinking={"type": "adaptive"}` broke tool use flow. The thinking blocks need to be passed back in the tool use loop and the interaction was fragile. Reverted to standard (no thinking) — the model does fine without explicit reasoning scaffolding.

### 2. Heavy design reasoning scaffold
A full multi-stage design thinking framework (problem expansion → analogical mapping → user modeling → composition → craft) was overkill. The model already does most of this naturally. The minimal 4-line checklist was far more effective.

### 3. Template-based visualization
Early plan was to constrain Claude to SQL + viz spec → Jinja2 templates. Would have been too rigid for the range of possible questions. Full HTML generation is the right call — safety is handled by iframe sandboxing.

## Key Metrics

- **2 rounds** for a well-documented schema query (down from 14 before schema fixes)
- **30-45 seconds** end-to-end for a complex visualization
- **~5K tokens** system prompt (schema context + design system + checklist)
- Query success rate near 100% when schema context is accurate

## Architecture Patterns to Port

| Prototype | Lightboard equivalent |
|---|---|
| `schema_context.py` (curated text) | `bootstrap.py` output → system prompt |
| `execute_query` tool | `queryTools` |
| `describe_table` tool | Add to `queryTools` if not present |
| `_extract_html` regex | ViewAgent output parsing |
| SSE streaming with status callbacks | Agent event stream |
| Timeline filmstrip (frontend) | View history in UI |
| PNG export via html2canvas | Export functionality |
| Design checklist in system prompt | Add to `view-prompt.ts` |
| IPL filtering gotcha in schema | `check_query_hints` tool (Item 5 from roadmap) |

## Data Issues Discovered

The prototype also uncovered a massive player ID mapping bug in the cricket database (ESPN player_id → object_id mapping was systematically shifted by one roster position). Fixed using cricsheet ground truth data. This validated the importance of data quality tooling alongside the query agent.

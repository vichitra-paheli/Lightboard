import { NextResponse } from 'next/server';
import { getAdminDb, withAuth } from '@/lib/auth';
import { getDataSourceConnection, DataSourceError } from '@/lib/data-source-service';
import { resolveAIProviders } from '@/lib/ai-provider';
import { generateSchemaContext, renderSchemaContext } from '@lightboard/agent';

/**
 * Annotation system prompt.
 *
 * Produces a briefing document with a stable set of H3 sections so downstream
 * tooling (the query-hints checker, past-mistakes injection) can parse the
 * output. Prose-first — the section headers are the only machine-readable
 * surface. Total output must stay under ~5500 chars to leave headroom under
 * the 6000 ceiling the caller truncates at.
 */
const ANNOTATION_PROMPT = `You are a database documentation expert. You will be given auto-generated PostgreSQL introspection output. Turn it into a concise briefing document that an AI SQL agent reads before every query.

Output a single markdown document with EXACTLY these H3 sections, in this order, using these exact headers:

### Tables
### Key Join Patterns
### Useful Enumerations
### Derived Metrics
### Semantic Dictionary
### Implicit Filters
### Gotchas
### Example Queries
### Past Mistakes

Begin the document with a level-1 title (\`# <Data Source Name>\`) and a single-paragraph description (domain, grain, time coverage). No summary section beyond that paragraph. Do NOT wrap the output in a code block.

Section guidance (approximate budgets — redistribute if a section has little to say, but keep every header present):

**Tables (~1500 chars)** — One block per meaningful table. Include: table name, grain in plain words (one row per what?), approximate row count if available, and only the semantically notable columns. Skip routine columns like \`id\`, \`created_at\` — they are self-explanatory. Example shape:

  **batting_derived** — Per-match batting scorecard (338K rows)
  - match_id, player_object_id -> players.object_id
  - runs, balls, strike_rate (numeric), is_not_out (bool)

**Key Join Patterns (~500 chars)** — Named join paths for the most-used table pairs. Eliminates which-key-to-use hesitation. Example:
  - Player from deliveries: \`players.object_id = deliveries.batsman_object_id\`

**Useful Enumerations (~500 chars)** — Low-cardinality text columns with the observed values. Lift these from the sample values in the introspection output; do not invent values.

**Derived Metrics (~800 chars)** — Named metrics with formulas and qualifiers. One block per metric, required fields formula + qualifier, optional interpretation. NULLIF guards belong in the formula. Example:

  strike_rate (batting):
    formula: SUM(runs) * 100.0 / NULLIF(SUM(balls), 0)
    qualifier: HAVING SUM(balls) >= 100
    interpretation: higher = faster scoring

Only include metrics whose columns ACTUALLY appear in the introspection input. If you cannot justify a metric from the schema, omit it.

**Semantic Dictionary (~500 chars)** — User-vocabulary -> schema-entity mappings with disambiguation. Focus on phrases that silently produce wrong answers if mis-resolved. Example:
  - "best batsman" — ambiguous. Default: strike_rate DESC with min 500 balls. Flag if user means consistency (batting_average) or volume (SUM runs).

**Implicit Filters (~600 chars)** — Filters applied by default unless explicitly overridden. Each entry must include a "when to skip" clause so the agent can justify omission. Format:

  name: one-sentence description
    predicate: SQL fragment
    when to apply: scope (tables or query shapes)
    when to skip: user intent that overrides this default

**Gotchas (~500 chars)** — Named traps that silently produce wrong answers. One block per gotcha: what goes wrong, how to avoid, how to detect.

**Example Queries (~800 chars)** — Two worked SELECT examples as raw SQL, each exercising at least one derived metric and one implicit filter.

**Past Mistakes** — Output EXACTLY this placeholder and nothing else:

  _(none yet)_

Hard rules:
- Do NOT invent columns, tables, or enum values that are absent from the introspection input. Omit a proposed metric or dictionary entry rather than hallucinate.
- Keep total output under 5500 characters.
- Every H3 header above must appear exactly once, in the order listed, even if a section is sparse.
- Output raw markdown only. No code fences around the whole document.`;

/**
 * POST /api/data-sources/[id]/schema/generate
 * Runs introspection + LLM annotation to produce a curated schema document.
 */
export const POST = withAuth(async (req, { db, orgId }) => {
  const segments = new URL(req.url).pathname.split('/');
  const generateIdx = segments.indexOf('generate');
  const id = segments[generateIdx - 2]; // .../[id]/schema/generate
  if (!id) {
    return NextResponse.json({ error: 'Data source ID is required' }, { status: 400 });
  }

  const adminDb = getAdminDb();

  // Step 1: Get connection and run introspection
  let rawMarkdown: string;
  try {
    const connection = await getDataSourceConnection(adminDb, orgId, id);
    const schemaContext = await generateSchemaContext(connection);
    rawMarkdown = renderSchemaContext(schemaContext);
  } catch (err) {
    if (err instanceof DataSourceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: `Introspection failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  // Step 2: Annotate with LLM (if a provider is available)
  // Schema annotation is a leader-class task, so use the leader-routed provider.
  const resolved = await resolveAIProviders(db, orgId);
  if (!resolved) {
    // No LLM configured — return raw markdown for manual editing
    return NextResponse.json({ rawMarkdown, annotatedMarkdown: rawMarkdown });
  }
  const { providers, maxTokens } = resolved;

  try {
    // Cap schema size to avoid sending massive prompts (38 tables can produce 30K+ chars)
    const maxSchemaChars = 12000;
    const schemaForLLM = rawMarkdown.length > maxSchemaChars
      ? rawMarkdown.slice(0, maxSchemaChars) + '\n\n... (truncated — full schema available in the editor)'
      : rawMarkdown;

    let annotatedMarkdown = '';
    const stream = providers.leader.chat(
      [{ role: 'user', content: schemaForLLM }],
      [], // no tools
      { system: ANNOTATION_PROMPT, maxTokens: maxTokens.leader },
    );

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        annotatedMarkdown += event.text;
      }
    }

    return NextResponse.json({ rawMarkdown, annotatedMarkdown });
  } catch (err) {
    // LLM annotation failed — return raw markdown as fallback
    console.error('[SchemaGenerate] LLM annotation failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ rawMarkdown, annotatedMarkdown: rawMarkdown });
  }
});

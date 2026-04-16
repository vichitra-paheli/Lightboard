import { NextResponse } from 'next/server';
import { getAdminDb, withAuth } from '@/lib/auth';
import { getDataSourceConnection, DataSourceError } from '@/lib/data-source-service';
import { resolveAIProvider } from '@/lib/ai-provider';
import { generateSchemaContext, renderSchemaContext } from '@lightboard/agent';

/** Annotation system prompt for the LLM. */
const ANNOTATION_PROMPT = `You are a database documentation expert. Below is auto-generated schema documentation for a PostgreSQL database. Annotate it to create a concise, high-quality reference that will help an AI agent write correct SQL queries on the first attempt.

Your output should be a single markdown document that includes:
1. Plain-English description for each table (one line)
2. Notes on important columns — what they mean, not just their type
3. Key join patterns with example SQL fragments
4. Data quality gotchas (naming quirks, NULL patterns, enum values to know about)
5. 3-5 example queries that answer typical questions about this data

Keep it concise — under 6000 characters. The AI agent will read this as context before every query.
Do NOT wrap the output in a code block. Output raw markdown only.`;

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

  // Step 2: Annotate with LLM (if provider is available)
  const provider = await resolveAIProvider(db, orgId);
  if (!provider) {
    // No LLM configured — return raw markdown for manual editing
    return NextResponse.json({ rawMarkdown, annotatedMarkdown: rawMarkdown });
  }

  try {
    // Cap schema size to avoid sending massive prompts (38 tables can produce 30K+ chars)
    const maxSchemaChars = 12000;
    const schemaForLLM = rawMarkdown.length > maxSchemaChars
      ? rawMarkdown.slice(0, maxSchemaChars) + '\n\n... (truncated — full schema available in the editor)'
      : rawMarkdown;

    let annotatedMarkdown = '';
    const stream = provider.chat(
      [{ role: 'user', content: schemaForLLM }],
      [], // no tools
      { system: ANNOTATION_PROMPT },
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

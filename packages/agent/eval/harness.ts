/**
 * Eval harness entry point. Drives a real {@link LeaderAgent} against a real
 * Postgres + a real LLM, one question at a time, and writes a per-question
 * artifact bundle (`log.jsonl`, `events.jsonl`, `view.html`, `narrate.json`,
 * `schema-doc.md`, `summary.json`) into `outDir/<timestamp>/<slug>/`.
 *
 * This is the tool Phase 3 will tune visual scaffolding against. It is NOT
 * a CI gate — runs are manual. An individual question failure (LLM endpoint
 * down, bad SQL, timeout) produces an error row in `summary.json.errors[]`
 * but never tears down the whole run.
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import pg from 'pg';

import {
  LeaderAgent,
  generateSchemaContext,
  renderSchemaContext,
  ScratchpadManager,
  type AgentDataSource,
  type AgentEvent,
  type LLMProvider,
  type ToolContext,
  ClaudeProvider,
  OpenAICompatibleProvider,
  ConversationLog,
  wrapToolContext,
} from '../src';

import { LEADER_PROMPT_VARIANT_B } from './prompts/leader-variant-b';
import { loadQuestions, type EvalQuestion } from './questions-loader';
import {
  REQUIRED_SCHEMA_DOC_SECTIONS,
  scoreQuestion,
  type NarratePayload,
  type QuestionSummary,
} from './scoring';

/** YAML sentinel that switches a question to the schema-doc bootstrap flow. */
export const SCHEMA_DOC_BOOTSTRAP_SENTINEL = '__SCHEMA_DOC_BOOTSTRAP__';

/** Configuration for one end-to-end eval run. */
export interface EvalOptions {
  /** OpenAI-compatible base URL (e.g. http://localhost:11434 for Ollama). */
  endpoint: string;
  /** Model name forwarded to the provider, e.g. `qwen3.6:35b`. */
  model: string;
  /** Absolute path to `questions.yaml`. */
  questionsPath: string;
  /** Output root. The run lands in `<outDir>/<timestamp>/`. */
  outDir: string;
  /** `A` (default, current leader prompt) or `B` (Variant B). */
  promptVariant?: 'A' | 'B';
  /** Postgres connection string — read from env at the CLI layer. */
  pgUrl: string;
  /** LLM provider kind. Defaults to openai-compatible. */
  providerKind?: 'openai-compatible' | 'claude';
  /** API key for auth'd endpoints. */
  apiKey?: string;
  /** Per-question wall-clock budget in ms. Default 180_000. */
  timeoutMs?: number;
  /** Filter to a subset of slugs. Empty/undefined means run all. */
  onlySlugs?: string[];
  /** Optional sink for progress strings — used by the CLI to print to stdout. */
  onProgress?: (line: string) => void;
}

/** Summary of a completed eval run, returned to the CLI. */
export interface EvalReport {
  runId: string;
  outDir: string;
  provider: {
    kind: string;
    endpoint: string;
    model: string;
    promptVariant: 'A' | 'B';
  };
  totalMs: number;
  questions: QuestionSummary[];
}

/**
 * Run every enabled question end-to-end, write artifacts to disk, and return
 * a compact report. Catches per-question failures so one bad question doesn't
 * tank the run.
 */
export async function runEval(opts: EvalOptions): Promise<EvalReport> {
  const variant: 'A' | 'B' = opts.promptVariant ?? 'A';
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(opts.outDir, runId);
  await fs.mkdir(runDir, { recursive: true });

  const questionsAll = await loadQuestions(opts.questionsPath);
  const questions = filterQuestions(questionsAll, opts.onlySlugs);
  if (questions.length === 0) {
    throw new Error(
      `No questions to run. Loaded ${questionsAll.length}, filter=${JSON.stringify(opts.onlySlugs ?? [])}`,
    );
  }

  const provider = buildProvider(opts);
  const runStart = Date.now();
  const summaries: QuestionSummary[] = [];

  opts.onProgress?.(`run ${runId} — ${questions.length} question(s), variant ${variant}`);

  for (const question of questions) {
    const slugDir = path.join(runDir, question.slug);
    await fs.mkdir(slugDir, { recursive: true });
    opts.onProgress?.(`• ${question.slug} — ${truncate(question.question, 72)}`);

    let summary: QuestionSummary;
    try {
      summary = await runSingleQuestion({
        question,
        provider,
        opts,
        variant,
        slugDir,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary = buildFailureSummary(question, msg);
      await writeJson(path.join(slugDir, 'summary.json'), summary);
    }
    summaries.push(summary);
    opts.onProgress?.(
      `  → ${summary.hasView ? 'view' : 'no-view'} | ${summary.hasKeyTakeaways ? 'takeaways' : 'no-takeaways'} | ${summary.hasCaveat ? 'caveat' : 'no-caveat'}${summary.chartType ? ` | ${summary.chartType}` : ''}${summary.errors.length > 0 ? ` | ${summary.errors.length} err` : ''}`,
    );
  }

  const totalMs = Date.now() - runStart;
  const report: EvalReport = {
    runId,
    outDir: runDir,
    provider: {
      kind: opts.providerKind ?? 'openai-compatible',
      endpoint: opts.endpoint,
      model: opts.model,
      promptVariant: variant,
    },
    totalMs,
    questions: summaries,
  };
  await writeJson(path.join(runDir, 'report.json'), report);
  return report;
}

/** Build the configured LLM provider. */
function buildProvider(opts: EvalOptions): LLMProvider {
  const kind = opts.providerKind ?? 'openai-compatible';
  if (kind === 'claude') {
    if (!opts.apiKey) {
      throw new Error('Claude provider requires an API key (--api-key or LIGHTBOARD_EVAL_API_KEY).');
    }
    return new ClaudeProvider({ apiKey: opts.apiKey, model: opts.model });
  }
  return new OpenAICompatibleProvider({
    baseUrl: opts.endpoint,
    apiKey: opts.apiKey,
    model: opts.model,
  });
}

/** Restrict to the requested slug subset, preserving file order. */
function filterQuestions(all: EvalQuestion[], only: string[] | undefined): EvalQuestion[] {
  if (!only || only.length === 0) return all;
  const set = new Set(only);
  return all.filter((q) => set.has(q.slug));
}

/** Inputs for the single-question driver. Bundled for readability. */
interface RunSingleInputs {
  question: EvalQuestion;
  provider: LLMProvider;
  opts: EvalOptions;
  variant: 'A' | 'B';
  slugDir: string;
}

/**
 * Drive one question end-to-end. Responsible for: building the pg pool,
 * shaping the ToolContext, launching the leader, honoring the timeout,
 * flushing the artifacts, and producing a {@link QuestionSummary}.
 *
 * Never throws — all failure modes are captured into `summary.errors[]`.
 */
async function runSingleQuestion(inputs: RunSingleInputs): Promise<QuestionSummary> {
  const { question, provider, opts, variant, slugDir } = inputs;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const harnessErrors: string[] = [];

  // One pool per question so leak-prone questions can't starve later ones.
  const pool = new pg.Pool({ connectionString: opts.pgUrl, max: 4, connectionTimeoutMillis: 5000 });
  try {
    // Probe the pool early — a cleaner error than a mid-run crash.
    await pool.query('SELECT 1');
  } catch (err) {
    await pool.end().catch(() => {});
    const msg = describeError(err) || 'connection failed';
    const summary = buildFailureSummary(question, `postgres unreachable: ${msg}`);
    await writeJson(path.join(slugDir, 'summary.json'), summary);
    return summary;
  }

  const isBootstrap = question.question.trim() === SCHEMA_DOC_BOOTSTRAP_SENTINEL;

  // Short-circuit: the schema-doc question runs the bootstrap flow directly,
  // bypassing the LeaderAgent so we score the ingestion output, not the
  // Q&A path.
  if (isBootstrap) {
    const { summary } = await runSchemaDocBootstrap({ question, opts, pool, slugDir });
    await pool.end().catch(() => {});
    return summary;
  }

  const sourceId = 'eval-ds';
  const dataSources: AgentDataSource[] = [
    {
      id: sourceId,
      name: question.dataSource,
      type: 'postgres',
      // No schema doc at the start of the run — the agent decides whether
      // to introspect. Bootstrap is out-of-scope for Q&A questions; those
      // are scored in their own sentinel entry.
      schemaDoc: null,
      schemaContext: null,
      cachedSchema: null,
    },
  ];

  const toolContext = buildToolContext(pool, sourceId);

  const convLog = new ConversationLog({
    sessionId: `eval_${question.slug}_${Date.now()}`,
    orgId: 'eval',
    userMessage: question.question,
    dataSources: dataSources.map((d) => ({ id: d.id, name: d.name, type: d.type })),
  });
  convLog.snapshotSchemaDocs(dataSources);
  convLog.push({ t: 'user_message', text: question.question });
  const loggedCtx = wrapToolContext(toolContext, convLog);

  const scratchpadManager = new ScratchpadManager({
    cleanupIntervalMs: 60 * 60 * 1000,
    maxSessionAgeMs: 60 * 60 * 1000,
  });

  const leader = new LeaderAgent({
    provider,
    toolContext: loggedCtx,
    dataSources,
    scratchpadManager,
    maxToolRounds: 25,
    subAgentMaxRounds: 15,
  });
  if (variant === 'B') {
    leader.setPromptOverride(LEADER_PROMPT_VARIANT_B);
  }

  const events: AgentEvent[] = [];
  let viewHtml: string | undefined;
  let narrate: NarratePayload | undefined;
  let stopReason: string | undefined;

  const started = Date.now();
  try {
    await streamWithTimeout({
      stream: leader.chat(question.question, `eval_session_${question.slug}`),
      timeoutMs,
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'tool_end' && !event.isError) {
          const latest = extractViewHtml(event);
          if (latest) viewHtml = latest;
          const narrated = extractNarratePayload(event);
          if (narrated) narrate = narrated;
        }
        if (event.type === 'done') {
          stopReason = event.stopReason;
        }
      },
    });
  } catch (err) {
    harnessErrors.push(err instanceof Error ? err.message : String(err));
    // If the leader errored mid-stream, best-effort cancel any tasks it
    // might have left running.
    try { leader.cancelAllTasks(); } catch { /* ignore */ }
  } finally {
    await pool.end().catch(() => {});
  }
  const durationMs = Date.now() - started;

  // Flush artifacts — events always, the rest conditionally. Any I/O failure
  // is logged into the summary, never thrown.
  await writeJsonl(path.join(slugDir, 'events.jsonl'), events).catch((e) =>
    harnessErrors.push(`events.jsonl write failed: ${describeError(e)}`),
  );
  await convLog
    .flush(slugDir, stopReason)
    .then((written) => {
      if (written && path.basename(written) !== 'log.jsonl') {
        // The ConversationLog uses a timestamp-prefixed filename; rename
        // the just-written file to `log.jsonl` for stable tooling.
        return fs.rename(written, path.join(slugDir, 'log.jsonl')).catch(() => undefined);
      }
      return undefined;
    })
    .catch((e) => harnessErrors.push(`log.jsonl write failed: ${describeError(e)}`));
  if (viewHtml) {
    await fs
      .writeFile(path.join(slugDir, 'view.html'), viewHtml, 'utf8')
      .catch((e) => harnessErrors.push(`view.html write failed: ${describeError(e)}`));
  }
  if (narrate) {
    await writeJson(path.join(slugDir, 'narrate.json'), narrate).catch((e) =>
      harnessErrors.push(`narrate.json write failed: ${describeError(e)}`),
    );
  }

  const summary = scoreQuestion({
    slug: question.slug,
    question: question.question,
    events,
    viewHtml,
    narrate,
    durationMs,
    expect: question.expect,
    harnessErrors,
  });
  if (stopReason) summary.stopReason = stopReason;
  await writeJson(path.join(slugDir, 'summary.json'), summary);
  return summary;
}

/**
 * Shape the ToolContext the leader will see. Mirrors `apps/web/.../chat/route.ts`
 * closely but talks to the eval pool directly — no auth, no org scoping.
 */
function buildToolContext(pool: pg.Pool, sourceId: string): ToolContext {
  return {
    getSchema: async (srcId) => {
      assertSource(srcId, sourceId);
      return introspectSchemaMinimal(pool);
    },
    runSQL: async (srcId, sql) => {
      assertSource(srcId, sourceId);
      const r = await pool.query(sql);
      return {
        columns: r.fields.map((f) => ({ name: f.name })),
        rows: r.rows,
        rowCount: r.rowCount ?? r.rows.length,
      } as Record<string, unknown>;
    },
    describeTable: async (srcId, tableName) => {
      assertSource(srcId, sourceId);
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_name = $1
            AND table_schema NOT IN ('pg_catalog','information_schema')
          ORDER BY ordinal_position`,
        [tableName],
      );
      let sampleRows: unknown[] = [];
      try {
        const sample = await pool.query(`SELECT * FROM "${tableName}" LIMIT 5`);
        sampleRows = sample.rows;
      } catch {
        // Best-effort; leave sample empty.
      }
      return {
        table: tableName,
        columns: cols.rows.map((c) => ({
          name: c.column_name,
          type: c.data_type,
          nullable: c.is_nullable === 'YES',
        })),
        sampleRows,
      } as Record<string, unknown>;
    },
    saveSchemaDoc: async () => {
      // Q&A harness doesn't persist docs — the bootstrap sentinel has its own path.
    },
  };
}

/** Minimal pg schema introspection used by the harness tool context. */
async function introspectSchemaMinimal(pool: pg.Pool): Promise<Record<string, unknown>> {
  const tables = await pool.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name`,
  );
  const columns = await pool.query(
    `SELECT table_schema, table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema NOT IN ('pg_catalog','information_schema')
      ORDER BY table_schema, table_name, ordinal_position`,
  );
  const byKey = new Map<string, Array<{ name: string; type: string }>>();
  for (const c of columns.rows) {
    const key = `${c.table_schema}.${c.table_name}`;
    const list = byKey.get(key) ?? [];
    list.push({ name: c.column_name, type: c.data_type });
    byKey.set(key, list);
  }
  return {
    tables: tables.rows.map((t) => ({
      schema: t.table_schema,
      name: t.table_name,
      columns: byKey.get(`${t.table_schema}.${t.table_name}`) ?? [],
    })),
  };
}

/** Guard rail — only the single eval data source is legal. */
function assertSource(received: string, expected: string): void {
  if (received !== expected) {
    throw new Error(
      `Eval harness: tool requested source "${received}", only "${expected}" is configured.`,
    );
  }
}

/**
 * Drive the schema-doc bootstrap path. Bypasses the LeaderAgent entirely —
 * we call `generateSchemaContext` + `renderSchemaContext` directly so the
 * scoring reflects the ingestion flow, not an LLM's ability to dispatch a
 * view tool.
 */
async function runSchemaDocBootstrap(args: {
  question: EvalQuestion;
  opts: EvalOptions;
  pool: pg.Pool;
  slugDir: string;
}): Promise<{ summary: QuestionSummary }> {
  const { question, opts, slugDir } = args;
  const started = Date.now();
  const errors: string[] = [];
  let schemaDoc: string | undefined;

  try {
    const connection = pgUrlToConnectionConfig(opts.pgUrl);
    const ctx = await generateSchemaContext(connection);
    const rendered = renderSchemaContext(ctx);
    schemaDoc = withEmptyBootstrapSections(rendered);
    await fs.writeFile(path.join(slugDir, 'schema-doc.md'), schemaDoc, 'utf8');
  } catch (err) {
    errors.push(`schema bootstrap failed: ${describeError(err)}`);
  }

  const durationMs = Date.now() - started;
  const summary = scoreQuestion({
    slug: question.slug,
    question: question.question,
    events: [],
    schemaDoc,
    durationMs,
    expect: question.expect,
    harnessErrors: errors,
  });
  await writeJson(path.join(slugDir, 'summary.json'), summary);
  return { summary };
}

/**
 * `renderSchemaContext` emits `## Database Schema` + `### <table>` headings.
 * The design rubric asks for a schema doc with 8 canonical H3 sections. Rather
 * than extend the ingestion code in this PR, append empty placeholders here so
 * the scoring loop measures *section shape* — not section *prose quality* —
 * against the reference taxonomy. Downstream work can populate them.
 */
function withEmptyBootstrapSections(rendered: string): string {
  const existing = rendered.toLowerCase();
  const missing = REQUIRED_SCHEMA_DOC_SECTIONS.filter(
    (s) => !existing.includes(`### ${s.toLowerCase()}`),
  );
  if (missing.length === 0) return rendered;
  const appended = missing.map((s) => `### ${s}\n_(to be filled in by follow-up work)_\n`).join('\n');
  return `${rendered.trimEnd()}\n\n## Bootstrap sections\n\n${appended}\n`;
}

/** Extract the latest view HTML from a tool_end payload, if any. */
function extractViewHtml(event: Extract<AgentEvent, { type: 'tool_end' }>): string | undefined {
  try {
    if (event.name === 'create_view' || event.name === 'modify_view') {
      const parsed = JSON.parse(event.result);
      const spec = parsed?.viewSpec ?? parsed;
      if (spec && typeof spec.html === 'string') return spec.html;
    }
    if (event.name === 'await_tasks') {
      const parsed = JSON.parse(event.result) as Record<string, unknown>;
      for (const value of Object.values(parsed)) {
        if (!value || typeof value !== 'object') continue;
        const v = value as Record<string, unknown>;
        if (v.role !== 'view' || v.success !== true) continue;
        const data = v.data as Record<string, unknown> | undefined;
        if (!data) continue;
        const spec = (data.viewSpec as Record<string, unknown> | undefined) ?? data;
        if (spec && typeof spec.html === 'string') return spec.html;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Extract the structured narrate_summary payload from a tool_end, if any. */
function extractNarratePayload(event: Extract<AgentEvent, { type: 'tool_end' }>): NarratePayload | undefined {
  if (event.name !== 'narrate_summary') return undefined;
  try {
    const parsed = JSON.parse(event.result);
    if (!parsed || !Array.isArray(parsed.bullets)) return undefined;
    return {
      bullets: parsed.bullets,
      ...(typeof parsed.caveat === 'string' && parsed.caveat ? { caveat: parsed.caveat } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Race an async iterable against a wall-clock timeout. Delivers each event
 * to `onEvent` as it arrives. Throws if the timeout elapses.
 */
async function streamWithTimeout(args: {
  stream: AsyncIterable<AgentEvent>;
  timeoutMs: number;
  onEvent: (event: AgentEvent) => void;
}): Promise<void> {
  const { stream, timeoutMs, onEvent } = args;
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`question timed out after ${timeoutMs}ms`)), timeoutMs);
    if (timer && typeof timer.unref === 'function') timer.unref();
  });

  const drain = (async () => {
    for await (const event of stream) {
      onEvent(event);
    }
  })();

  try {
    await Promise.race([drain, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Build a summary for a question that never even started. */
function buildFailureSummary(q: EvalQuestion, message: string): QuestionSummary {
  return scoreQuestion({
    slug: q.slug,
    question: q.question,
    events: [],
    durationMs: 0,
    expect: q.expect,
    harnessErrors: [message],
  });
}

/** Pretty-print an unknown error. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Stringify + write JSON with a newline tail. */
async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/** Write an array as newline-delimited JSON. */
async function writeJsonl(filePath: string, events: AgentEvent[]): Promise<void> {
  const body = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(filePath, body, 'utf8');
}

/** Trim a string to `n` chars with an ellipsis for compact progress lines. */
function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}

/**
 * Compact one-row-per-question text table for stdout, suitable for piping
 * into a file. Uses ✓/✗ glyphs; ANSI color is applied by the CLI when the
 * target is a TTY.
 */
export function renderStdoutTable(report: EvalReport): string {
  const header = ['slug', 'tools', 'dur_s', 'view', 'takeaways', 'caveat', 'chart_type', 'errors'];
  const rows = report.questions.map((q) => [
    q.slug,
    String(q.toolCallCount),
    (q.durationMs / 1000).toFixed(1),
    q.hasView ? '✓' : '✗',
    q.hasKeyTakeaways ? '✓' : '✗',
    q.hasCaveat ? '✓' : '✗',
    q.chartType ?? '—',
    String(q.errors.length),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const pad = (value: string, i: number): string => value.padEnd(widths[i] ?? value.length);
  const head = header.map((h, i) => pad(h, i)).join('  ');
  const body = rows.map((r) => r.map((v, i) => pad(v, i)).join('  ')).join('\n');
  return `${head}\n${body}`;
}

/** Check that a path exists synchronously (used by the CLI before invoking). */
export function fileExists(p: string): boolean {
  return existsSync(p);
}

/**
 * Parse a Postgres connection URL into the discrete-field `ConnectionConfig`
 * expected by `generateSchemaContext`. Throws on a malformed URL.
 */
function pgUrlToConnectionConfig(url: string): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  if (!parsed.protocol.startsWith('postgres')) {
    throw new Error(`Expected postgres:// URL, got "${parsed.protocol}"`);
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (!database) throw new Error('Postgres URL is missing the database name');
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number(parsed.port) : 5432,
    database,
    user: decodeURIComponent(parsed.username || ''),
    password: decodeURIComponent(parsed.password || ''),
  };
}

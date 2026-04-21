#!/usr/bin/env node
/**
 * Eval harness CLI. Launched via `pnpm --filter @lightboard/agent eval`.
 * Parses flags, validates required inputs, runs the eval, prints a compact
 * pass/fail table to stdout, and exits non-zero if any question produced
 * errors.
 *
 * Flag reference (also mirrored in `eval/README.md`):
 *   --endpoint     LLM base URL (env: LIGHTBOARD_EVAL_ENDPOINT)
 *   --model        Model name (env: LIGHTBOARD_EVAL_MODEL)
 *   --variant      A | B, default A
 *   --questions    path to questions.yaml
 *   --out          output dir, default packages/agent/eval/results
 *   --provider     openai-compatible | claude
 *   --api-key      auth token (env: LIGHTBOARD_EVAL_API_KEY)
 *   --pg-url       Postgres URL (env: LIGHTBOARD_EVAL_PG_URL) — required
 *   --only         comma-separated slug list
 *   --timeout-ms   per-question wall clock budget, default 180000
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderStdoutTable, runEval } from './harness';

const USAGE = `Usage:
  pnpm --filter @lightboard/agent eval [--endpoint=URL] [--model=NAME] [options]

Required:
  --pg-url             Postgres connection string (env: LIGHTBOARD_EVAL_PG_URL)
  --endpoint           LLM base URL for openai-compatible (env: LIGHTBOARD_EVAL_ENDPOINT)
  --model              Model name (env: LIGHTBOARD_EVAL_MODEL)

Options:
  --variant=A|B        Prompt variant (default: A)
  --questions=PATH     questions.yaml (default: packages/agent/eval/questions.yaml)
  --out=DIR            output root (default: packages/agent/eval/results)
  --provider=KIND      openai-compatible | claude (default: openai-compatible)
  --api-key=KEY        API key (env: LIGHTBOARD_EVAL_API_KEY)
  --only=a,b,c         Restrict to specific slugs
  --timeout-ms=N       Per-question timeout in ms (default: 180000)
  --help               Print this message

Examples:
  LIGHTBOARD_EVAL_PG_URL=postgres://cricket_user:cricket_pass@localhost:5434/cricket \\
    pnpm --filter @lightboard/agent eval \\
    --endpoint=http://localhost:11434 --model=qwen3.6:35b

  pnpm --filter @lightboard/agent eval \\
    --provider=claude --model=claude-sonnet-4-20250514 \\
    --api-key=sk-... --pg-url=postgres://...
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      endpoint: { type: 'string' },
      model: { type: 'string' },
      variant: { type: 'string' },
      questions: { type: 'string' },
      out: { type: 'string' },
      provider: { type: 'string' },
      'api-key': { type: 'string' },
      'pg-url': { type: 'string' },
      only: { type: 'string' },
      'timeout-ms': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  const pgUrl = values['pg-url'] ?? process.env.LIGHTBOARD_EVAL_PG_URL;
  const endpoint = values.endpoint ?? process.env.LIGHTBOARD_EVAL_ENDPOINT;
  const model = values.model ?? process.env.LIGHTBOARD_EVAL_MODEL;
  const apiKey = values['api-key'] ?? process.env.LIGHTBOARD_EVAL_API_KEY;
  const providerKind = (values.provider ?? 'openai-compatible') as 'openai-compatible' | 'claude';
  const variant = (values.variant ?? 'A') as 'A' | 'B';
  const onlyRaw = values.only ?? '';
  const onlySlugs = onlyRaw.split(',').map((s) => s.trim()).filter(Boolean);
  const timeoutMs = values['timeout-ms'] ? Number(values['timeout-ms']) : 180_000;

  const missing: string[] = [];
  if (!pgUrl) missing.push('--pg-url / LIGHTBOARD_EVAL_PG_URL');
  if (providerKind === 'openai-compatible' && !endpoint) missing.push('--endpoint / LIGHTBOARD_EVAL_ENDPOINT');
  if (!model) missing.push('--model / LIGHTBOARD_EVAL_MODEL');
  if (providerKind === 'claude' && !apiKey) missing.push('--api-key / LIGHTBOARD_EVAL_API_KEY');
  if (missing.length > 0) {
    process.stderr.write(`Missing required arg(s): ${missing.join(', ')}\n\n${USAGE}`);
    process.exit(2);
  }
  if (variant !== 'A' && variant !== 'B') {
    process.stderr.write(`--variant must be A or B (got "${variant}")\n`);
    process.exit(2);
  }

  const evalRoot = path.dirname(fileURLToPath(import.meta.url));
  const questionsPath = path.resolve(values.questions ?? path.join(evalRoot, 'questions.yaml'));
  const outDir = path.resolve(values.out ?? path.join(evalRoot, 'results'));

  const report = await runEval({
    endpoint: endpoint ?? '',
    model: model ?? '',
    questionsPath,
    outDir,
    promptVariant: variant,
    pgUrl: pgUrl!,
    providerKind,
    apiKey,
    timeoutMs,
    onlySlugs,
    onProgress: (line) => process.stdout.write(`${line}\n`),
  });

  process.stdout.write('\n');
  process.stdout.write(renderStdoutTable(report));
  process.stdout.write(
    `\n\nRun artifacts: ${report.outDir}\nTotal: ${(report.totalMs / 1000).toFixed(1)}s across ${report.questions.length} question(s).\n`,
  );

  const hasErrors = report.questions.some((q) => q.errors.length > 0);
  process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`eval failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});

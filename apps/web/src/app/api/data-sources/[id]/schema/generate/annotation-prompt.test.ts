/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

/**
 * The annotator prompt must instruct the LLM to emit every H3 briefing
 * section in a fixed order. Downstream tooling (query-hints checker, past-
 * mistakes injection) depends on these headers being present verbatim.
 *
 * We assert the prompt text directly rather than running the LLM — the goal
 * is to catch accidental regressions in the prompt contract.
 */

const EXPECTED_HEADERS = [
  '### Tables',
  '### Key Join Patterns',
  '### Useful Enumerations',
  '### Derived Metrics',
  '### Semantic Dictionary',
  '### Implicit Filters',
  '### Gotchas',
  '### Example Queries',
  '### Past Mistakes',
] as const;

describe('schema annotator prompt contract', () => {
  it('contains every required H3 section in order', async () => {
    const mod = await import('./route');
    // The prompt is a private const; re-read the source to avoid exporting
    // it just for tests.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('./route.ts', import.meta.url), 'utf8');
    const promptMatch = src.match(/const ANNOTATION_PROMPT = `([\s\S]*?)`;/);
    const prompt = promptMatch?.[1];
    expect(prompt, 'ANNOTATION_PROMPT template literal not found').toBeTruthy();

    let cursor = 0;
    for (const header of EXPECTED_HEADERS) {
      const idx = prompt!.indexOf(header, cursor);
      expect(idx, `missing or out-of-order header ${header}`).toBeGreaterThan(-1);
      cursor = idx + header.length;
    }

    // Exercise the import so lint doesn't flag `mod` as dead weight and we
    // fail fast on syntax errors in the route file.
    expect(mod).toBeDefined();
  });

  it('pins the Past Mistakes placeholder to "(none yet)"', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('./route.ts', import.meta.url), 'utf8');
    expect(src).toContain('_(none yet)_');
  });

  it('forbids inventing columns in the prompt instructions', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('./route.ts', import.meta.url), 'utf8');
    expect(src.toLowerCase()).toContain('do not invent');
  });
});

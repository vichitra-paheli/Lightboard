import { describe, expect, it, vi } from 'vitest';
import { ToolRouter, type ToolContext } from './router';

/**
 * Focused tests for the malformed-input coercion paths added to make
 * `create_view` survive local-model quirks (Qwen chunking the html body into
 * arrays, wrapping the whole tool payload in an `input:` envelope, etc.).
 *
 * Each test exercises one concrete failure mode from the live eval logs.
 * The goal is not schema coverage — `router.test.ts` already asserts the
 * happy path — but to pin down the shapes we now tolerate and the ones we
 * still reject with a readable error.
 */
function createMockContext(): ToolContext {
  return {
    getSchema: vi.fn().mockResolvedValue({ tables: [] }),
  };
}

describe('ToolRouter — create_view malformed input tolerance', () => {
  it('accepts html delivered as an array of strings (joined with "")', async () => {
    const router = new ToolRouter(createMockContext());
    const htmlChunks = ['<!doc>', '<html>', '<body>chart</body>', '</html>'];

    const result = await router.execute('create_view', {
      title: 'Top Batters',
      sql: 'SELECT batter FROM ball_by_ball LIMIT 10',
      html: htmlChunks,
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewSpec.html).toBe(htmlChunks.join(''));
  });

  it('preserves newlines when html is an array of lines', async () => {
    const router = new ToolRouter(createMockContext());
    const lines = ['line1\n', 'line2\n', 'line3\n'];

    const result = await router.execute('create_view', {
      title: 't',
      sql: 's',
      html: lines,
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewSpec.html).toBe('line1\nline2\nline3\n');
  });

  it('unwraps a single-key `input: "<json>"` envelope and routes through', async () => {
    const router = new ToolRouter(createMockContext());
    const body = JSON.stringify({
      title: 'x',
      sql: 'SELECT 1',
      html: '<html></html>',
    });

    const result = await router.execute('create_view', { input: body });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewSpec.title).toBe('x');
    expect(parsed.viewSpec.html).toBe('<html></html>');
  });

  it('coerces numeric title / sql to strings instead of failing Zod', async () => {
    const router = new ToolRouter(createMockContext());

    const result = await router.execute('create_view', {
      title: 42 as unknown as string,
      sql: 1 as unknown as string,
      html: '<html></html>',
    });

    expect(result.isError).toBe(false);
    const parsed = JSON.parse(result.content);
    expect(parsed.viewSpec.title).toBe('42');
    expect(parsed.viewSpec.sql).toBe('1');
  });

  it('returns a precise per-field error when html is missing', async () => {
    const router = new ToolRouter(createMockContext());

    const result = await router.execute('create_view', {
      title: 'x',
      sql: 'SELECT 1',
      // html intentionally missing
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('create_view');
    expect(result.content).toContain('html');
    expect(result.content).toContain('got undefined');
    // The retry guidance is load-bearing — without it Qwen repeats the same
    // malformed call 8 times in a row.
    expect(result.content).toContain('Re-emit');
  });

  it('returns a precise per-field error when html is a raw number', async () => {
    const router = new ToolRouter(createMockContext());

    const result = await router.execute('create_view', {
      title: 'x',
      sql: 'SELECT 1',
      // coerceViewInput stringifies numbers, so html:42 actually succeeds;
      // use an object instead — that path is not coerced and Zod must flag it.
      html: { nested: 'oops' } as unknown as string,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('html');
    expect(result.content).toContain('got object');
  });

  it('returns a precise per-field error when html is an array of non-strings', async () => {
    const router = new ToolRouter(createMockContext());

    const result = await router.execute('create_view', {
      title: 'x',
      sql: 'SELECT 1',
      // Mixed-type array — not safe to join, so coerceViewInput leaves it.
      html: ['<html>', 42, '</html>'] as unknown as string,
    });

    expect(result.isError).toBe(true);
    expect(result.content).toContain('html');
    expect(result.content).toContain('got array');
  });
});

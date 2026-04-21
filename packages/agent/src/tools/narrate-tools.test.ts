import { describe, expect, it } from 'vitest';

import { narrateTools } from './narrate-tools';

/**
 * These tests lock the public shape of the `narrate_summary` tool: the
 * definition's schema is what the LLM sees and what the provider
 * validates. If an edit here accidentally loosens the schema (e.g.,
 * drops `minItems`), we want to know immediately — local Qwen 3.6
 * depends on the constraint being impossible to miss.
 */
describe('narrateTools', () => {
  it('exports exactly one tool definition', () => {
    expect(narrateTools).toHaveLength(1);
  });

  it('uses the name "narrate_summary"', () => {
    expect(narrateTools[0]!.name).toBe('narrate_summary');
  });

  it('declares a non-trivial description mentioning the 3-bullet contract', () => {
    const desc = narrateTools[0]!.description;
    expect(desc.length).toBeGreaterThan(100);
    expect(desc).toMatch(/3 ranked bullets/);
    expect(desc).toMatch(/rank 1 = biggest/);
  });

  it('requires bullets at the top level and constrains it to exactly 3 entries', () => {
    const schema = narrateTools[0]!.inputSchema as Record<string, unknown>;
    expect((schema.required as string[])).toContain('bullets');
    const bullets = (schema.properties as Record<string, unknown>).bullets as Record<string, unknown>;
    expect(bullets.type).toBe('array');
    expect(bullets.minItems).toBe(3);
    expect(bullets.maxItems).toBe(3);
  });

  it('constrains bullet.rank to the enum {1, 2, 3}', () => {
    const schema = narrateTools[0]!.inputSchema as Record<string, unknown>;
    const bullets = (schema.properties as Record<string, unknown>).bullets as Record<string, unknown>;
    const item = bullets.items as Record<string, unknown>;
    const rank = (item.properties as Record<string, unknown>).rank as Record<string, unknown>;
    expect(rank.type).toBe('integer');
    expect(rank.enum).toEqual([1, 2, 3]);
  });

  it('requires headline + body but leaves value optional', () => {
    const schema = narrateTools[0]!.inputSchema as Record<string, unknown>;
    const bullets = (schema.properties as Record<string, unknown>).bullets as Record<string, unknown>;
    const item = bullets.items as Record<string, unknown>;
    expect(item.required).toEqual(['rank', 'headline', 'body']);
    const props = item.properties as Record<string, unknown>;
    expect(props).toHaveProperty('value');
    // `value` is a string but must not appear in required.
    const value = props.value as Record<string, unknown>;
    expect(value.type).toBe('string');
  });

  it('caveat is an optional string at the top level', () => {
    const schema = narrateTools[0]!.inputSchema as Record<string, unknown>;
    const caveat = (schema.properties as Record<string, unknown>).caveat as Record<string, unknown>;
    expect(caveat.type).toBe('string');
    expect((schema.required as string[])).not.toContain('caveat');
  });
});

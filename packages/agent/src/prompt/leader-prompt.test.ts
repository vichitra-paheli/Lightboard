import { describe, expect, it } from 'vitest';

import { buildLeaderPrompt } from './leader-prompt';

describe('buildLeaderPrompt', () => {
  it('includes the voice card with the core editorial rules', () => {
    const prompt = buildLeaderPrompt({ dataSources: [] });
    expect(prompt).toContain('Voice');
    expect(prompt).toMatch(/first person/i);
    expect(prompt).toMatch(/no emoji/i);
    // Signed-delta rule is explicit about the + marker.
    expect(prompt).toContain('+');
    // Numeric-value formatting rule is present.
    expect(prompt).toMatch(/backtick/i);
  });

  it('keeps the narrate_summary directive (Phase 2)', () => {
    const prompt = buildLeaderPrompt({ dataSources: [] });
    expect(prompt).toContain('narrate_summary');
    expect(prompt).toMatch(/ranked bullets/i);
  });

  it('lists available data sources', () => {
    const prompt = buildLeaderPrompt({
      dataSources: [{ id: 'pg-1', name: 'Cricket DB', type: 'postgres' }],
    });
    expect(prompt).toContain('Cricket DB');
    expect(prompt).toContain('pg-1');
  });

  it('lists scratchpad tables when provided', () => {
    const prompt = buildLeaderPrompt({
      dataSources: [],
      scratchpadTables: ['query_1 (250 rows): ...'],
    });
    expect(prompt).toContain('Scratchpad Tables');
    expect(prompt).toContain('query_1');
  });

  it('stays under a sane token budget with the voice card', () => {
    // Original leader prompt sat at ~5.2k chars (~1.3k tokens). The voice
    // card adds ~1k chars on top. 6k is the realistic ceiling without
    // chopping directive text; regress loudly if someone crosses it.
    const prompt = buildLeaderPrompt({ dataSources: [] });
    expect(prompt.length).toBeLessThan(6_000);
  });
});

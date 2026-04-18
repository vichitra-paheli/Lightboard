import { describe, expect, it } from 'vitest';

import { checkQueryHints, type HintSchemaContext } from './query-hints';

function ctx(): HintSchemaContext {
  return {
    tables: [
      {
        name: 'matches',
        sampleValues: {
          format: ['T20', 'ODI', 'TEST'],
          venue: ['Eden Gardens', 'Lord\'s', 'MCG'],
        },
      },
      {
        name: 'players',
        sampleValues: {
          role: ['batter', 'bowler', 'allrounder'],
        },
      },
    ],
  };
}

describe('checkQueryHints', () => {
  it('returns ok for an empty context', () => {
    expect(checkQueryHints('SELECT 1', null)).toEqual({ ok: true, warnings: [] });
  });

  it('returns ok when the filter value matches a sampled enum', () => {
    const result = checkQueryHints("SELECT * FROM matches WHERE format = 'T20'", ctx());
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('flags an enum-like mismatch and suggests sampled values', () => {
    const result = checkQueryHints("SELECT * FROM matches WHERE format = 'T-20'", ctx());
    expect(result.ok).toBe(false);
    expect(result.warnings).toHaveLength(1);
    const warning = result.warnings[0]!;
    expect(warning.kind).toBe('enum_mismatch');
    expect(warning.column).toBe('format');
    expect(warning.value).toBe('T-20');
    expect(warning.suggested_values).toEqual(['T20', 'ODI', 'TEST']);
  });

  it('flags mismatches inside an IN list', () => {
    const result = checkQueryHints(
      "SELECT * FROM players WHERE role IN ('batter', 'keeper', 'allrounder')",
      ctx(),
    );
    expect(result.ok).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.value).toBe('keeper');
  });

  it('handles double-quoted and qualified column names', () => {
    const result = checkQueryHints(
      "SELECT * FROM matches m WHERE m.\"format\" = 'Twenty20'",
      ctx(),
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.value).toBe('Twenty20');
  });

  it('is case-insensitive on column names', () => {
    const result = checkQueryHints("SELECT * FROM matches WHERE Format = 'T21'", ctx());
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.column).toBe('Format');
  });

  it('silently skips columns it does not know', () => {
    const result = checkQueryHints("SELECT * FROM matches WHERE season = 'IPL-2024'", ctx());
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('does not misfire on qualified identifiers after dots (handles "m.format = ")', () => {
    const result = checkQueryHints(
      "SELECT * FROM matches m WHERE m.format = 'ODI'",
      ctx(),
    );
    expect(result.ok).toBe(true);
  });
});

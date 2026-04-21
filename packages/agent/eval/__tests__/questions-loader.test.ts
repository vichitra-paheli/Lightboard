import { describe, expect, it } from 'vitest';

import { parseQuestionsYaml } from '../questions-loader';

describe('parseQuestionsYaml', () => {
  it('parses a single entry with all fields', () => {
    const yaml = `
- slug: foo
  question: Show the thing
  dataSource: cricket
  expect:
    chart: line
    hasCaveat: true
`;
    const entries = parseQuestionsYaml(yaml);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      slug: 'foo',
      question: 'Show the thing',
      dataSource: 'cricket',
      expect: { chart: 'line', hasCaveat: true },
    });
  });

  it('parses multiple entries back-to-back', () => {
    const yaml = `
- slug: a
  question: First
  dataSource: cricket
- slug: b
  question: Second
  dataSource: retail
  expect:
    chart: bar
`;
    const entries = parseQuestionsYaml(yaml);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.slug).toBe('a');
    expect(entries[1]?.slug).toBe('b');
    expect(entries[1]?.expect?.chart).toBe('bar');
  });

  it('strips inline comments', () => {
    const yaml = `
- slug: one   # leading entry
  question: Q? # with punctuation
  dataSource: cricket
`;
    const entries = parseQuestionsYaml(yaml);
    expect(entries[0]?.question).toBe('Q?');
  });

  it('throws on missing required fields', () => {
    expect(() => parseQuestionsYaml('- slug: only\n  question: incomplete')).toThrow(/dataSource/);
  });
});

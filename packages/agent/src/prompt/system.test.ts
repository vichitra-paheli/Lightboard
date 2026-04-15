import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './system';

describe('buildSystemPrompt', () => {
  it('includes core instructions', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('data exploration assistant');
    expect(prompt).toContain('run_sql');
    expect(prompt).toContain('describe_table');
  });

  it('includes data source list', () => {
    const prompt = buildSystemPrompt({
      dataSources: [
        { id: 'pg-1', name: 'Production DB', type: 'postgres' },
        { id: 'csv-1', name: 'Sales CSV', type: 'csv' },
      ],
    });
    expect(prompt).toContain('Production DB');
    expect(prompt).toContain('pg-1');
    expect(prompt).toContain('Sales CSV');
  });

  it('includes current view state when provided', () => {
    const prompt = buildSystemPrompt({
      dataSources: [],
      currentView: { title: 'My Chart', html: '<html></html>' },
    });
    expect(prompt).toContain('Current view state');
    expect(prompt).toContain('My Chart');
  });

  it('omits view section when no current view', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).not.toContain('Current view state');
  });

  it('mentions SQL and tool usage', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('run_sql');
    expect(prompt).toContain('PostgreSQL');
    expect(prompt).toContain('LIMIT');
  });

  it('mentions self-correction', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('Self-correct');
  });
});

import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './system';

describe('buildSystemPrompt', () => {
  it('includes core instructions', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('data exploration assistant');
    expect(prompt).toContain('QueryIR');
    expect(prompt).toContain('get_schema');
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
      currentView: { title: 'My Chart', chart: { type: 'bar-chart' } },
    });
    expect(prompt).toContain('Current view state');
    expect(prompt).toContain('My Chart');
    expect(prompt).toContain('bar-chart');
  });

  it('omits view section when no current view', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).not.toContain('Current view state');
  });

  it('mentions all chart types', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('time-series-line');
    expect(prompt).toContain('bar-chart');
    expect(prompt).toContain('stat-card');
    expect(prompt).toContain('data-table');
  });

  it('mentions self-correction', () => {
    const prompt = buildSystemPrompt({ dataSources: [] });
    expect(prompt).toContain('Self-correct');
  });
});

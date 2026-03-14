import { describe, expect, it } from 'vitest';
import { PanelRegistry } from './registry';
import type { PanelPlugin } from './types';

const mockPlugin: PanelPlugin = {
  id: 'mock-chart',
  name: 'Mock Chart',
  configSchema: {},
  dataShape: { minColumns: 1, description: 'Mock' },
  Component: () => null,
};

describe('PanelRegistry', () => {
  it('registers and retrieves a plugin', () => {
    const registry = new PanelRegistry();
    registry.register(mockPlugin);
    expect(registry.get('mock-chart')).toBe(mockPlugin);
  });

  it('throws on duplicate registration', () => {
    const registry = new PanelRegistry();
    registry.register(mockPlugin);
    expect(() => registry.register(mockPlugin)).toThrow('already registered');
  });

  it('returns undefined for unknown id', () => {
    const registry = new PanelRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('checks if plugin exists', () => {
    const registry = new PanelRegistry();
    expect(registry.has('mock-chart')).toBe(false);
    registry.register(mockPlugin);
    expect(registry.has('mock-chart')).toBe(true);
  });

  it('lists all registered ids', () => {
    const registry = new PanelRegistry();
    registry.register(mockPlugin);
    registry.register({ ...mockPlugin, id: 'other', name: 'Other' });
    expect(registry.ids()).toEqual(['mock-chart', 'other']);
  });

  it('lists all plugins', () => {
    const registry = new PanelRegistry();
    registry.register(mockPlugin);
    expect(registry.all()).toHaveLength(1);
  });

  it('unregisters a plugin', () => {
    const registry = new PanelRegistry();
    registry.register(mockPlugin);
    expect(registry.unregister('mock-chart')).toBe(true);
    expect(registry.has('mock-chart')).toBe(false);
  });
});

import type { PanelPlugin } from './types';

/**
 * Registry for panel plugins. Charts register themselves at startup,
 * and the host looks up panels by ID to render them.
 */
export class PanelRegistry {
  private plugins = new Map<string, PanelPlugin>();

  /** Register a panel plugin. */
  register(plugin: PanelPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Panel plugin "${plugin.id}" is already registered`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  /** Look up a panel plugin by ID. */
  get(id: string): PanelPlugin | undefined {
    return this.plugins.get(id);
  }

  /** Check if a panel plugin is registered. */
  has(id: string): boolean {
    return this.plugins.has(id);
  }

  /** List all registered panel plugin IDs. */
  ids(): string[] {
    return [...this.plugins.keys()];
  }

  /** List all registered panel plugins. */
  all(): PanelPlugin[] {
    return [...this.plugins.values()];
  }

  /** Remove a panel plugin. */
  unregister(id: string): boolean {
    return this.plugins.delete(id);
  }
}

/** Default global panel registry. */
export const defaultPanelRegistry = new PanelRegistry();

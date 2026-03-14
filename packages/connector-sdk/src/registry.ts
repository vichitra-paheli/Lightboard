import type { Connector, ConnectorConfig } from './types';

/** Factory function that creates a connector instance. */
export type ConnectorFactory = () => Connector;

/**
 * Registry for looking up connector factories by type.
 * Each connector type (postgres, mysql, etc.) registers a factory function.
 */
export class ConnectorRegistry {
  private factories = new Map<string, ConnectorFactory>();

  /** Register a connector factory for a given type. */
  register(type: string, factory: ConnectorFactory): void {
    if (this.factories.has(type)) {
      throw new Error(`Connector type "${type}" is already registered`);
    }
    this.factories.set(type, factory);
  }

  /** Create a connector instance for the given config. */
  create(config: ConnectorConfig): Connector {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(
        `Unknown connector type "${config.type}". Available: ${[...this.factories.keys()].join(', ')}`,
      );
    }
    return factory();
  }

  /** Check if a connector type is registered. */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /** List all registered connector types. */
  types(): string[] {
    return [...this.factories.keys()];
  }

  /** Remove a registered connector type. */
  unregister(type: string): boolean {
    return this.factories.delete(type);
  }
}

/** Default global connector registry. */
export const defaultRegistry = new ConnectorRegistry();

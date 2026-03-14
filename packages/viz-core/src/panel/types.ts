import type { ComponentType } from 'react';
import type { ChartTheme } from '../theme/types';

/** Column type classification for data shape declarations. */
export type ColumnType = 'time' | 'numeric' | 'categorical' | 'boolean' | 'unknown';

/** Declares what data shape a panel expects. */
export interface DataShapeDeclaration {
  /** Minimum required columns. */
  minColumns: number;
  /** Maximum supported columns (undefined = unlimited). */
  maxColumns?: number;
  /** Required column types. */
  requiredTypes?: ColumnType[];
  /** Description of expected data shape. */
  description: string;
}

/** Event emitted when a user interacts with a panel (click, brush, etc.). */
export interface PanelInteractionEvent {
  type: 'click' | 'brush' | 'hover';
  payload: Record<string, unknown>;
}

/** Props passed to every panel component by the host. */
export interface PanelProps<TData = Record<string, unknown>[], TConfig = Record<string, unknown>> {
  /** The data to visualize. */
  data: TData;
  /** Panel-specific configuration. */
  config: TConfig;
  /** Available width in pixels. */
  width: number;
  /** Available height in pixels. */
  height: number;
  /** Current chart theme. */
  theme: ChartTheme;
  /** Callback for interaction events. */
  onInteraction?: (event: PanelInteractionEvent) => void;
}

/** The adapter interface for visualization components. */
export interface PanelPlugin<TData = Record<string, unknown>[], TConfig = Record<string, unknown>> {
  /** Unique identifier for this panel type. */
  id: string;
  /** Display name. */
  name: string;
  /** JSON Schema for the panel's configuration. */
  configSchema: Record<string, unknown>;
  /** Declaration of what data shape this panel expects. */
  dataShape: DataShapeDeclaration;
  /** The React component that renders the panel. */
  Component: ComponentType<PanelProps<TData, TConfig>>;
}

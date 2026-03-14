import type { QueryIR } from '@lightboard/query-ir';

/** Control types available in a ViewSpec. */
export type ControlType = 'dropdown' | 'multi_select' | 'date_range' | 'text_input' | 'toggle';

/** Specification for an interactive control bound to a template variable. */
export interface ControlSpec {
  /** Control type. */
  type: ControlType;
  /** Display label. */
  label: string;
  /** Template variable name (without $). */
  variable: string;
  /** Optional QueryIR to populate options (for dropdown/multi_select). */
  source?: QueryIR;
  /** Static options list (alternative to source query). */
  options?: { label: string; value: string }[];
  /** Default value for the control. */
  defaultValue?: unknown;
}

/** Chart specification within a ViewSpec. */
export interface ChartSpec {
  /** Panel plugin ID (e.g. 'time-series-line', 'bar-chart'). */
  type: string;
  /** Chart-specific configuration passed to the panel component. */
  config: Record<string, unknown>;
}

/**
 * The ViewSpec — the agent's primary output format.
 * A declarative JSON document describing a complete interactive visualization:
 * the query, chart type + config, and interactive controls.
 */
export interface ViewSpec {
  /** QueryIR that produces the view's data. */
  query: QueryIR;
  /** Chart type and configuration. */
  chart: ChartSpec;
  /** Interactive controls bound to template variables. */
  controls: ControlSpec[];
  /** View title. */
  title?: string;
  /** View description. */
  description?: string;
}

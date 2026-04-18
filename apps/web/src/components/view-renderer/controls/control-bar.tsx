'use client';

import type { ControlSpec } from '@lightboard/viz-core';

import { LightboardLoader } from '../../brand';
import { DateRangeControl } from './date-range-control';
import { DropdownControl } from './dropdown-control';
import { TextInputControl } from './text-input-control';
import { ToggleControl } from './toggle-control';

/** Props for ControlBar. */
interface ControlBarProps {
  controls: ControlSpec[];
  values: Record<string, unknown>;
  onChange: (variable: string, value: unknown) => void;
  /**
   * When true, render a 14px LightboardLoader at the trailing end of the
   * bar. Signals that the chart is re-querying as a result of a control
   * change so the user knows their input was received.
   */
  isLoading?: boolean;
}

/**
 * Renders a horizontal bar of interactive controls above the chart.
 * Each control is bound to a template variable in the QueryIR.
 */
export function ControlBar({
  controls,
  values,
  onChange,
  isLoading,
}: ControlBarProps) {
  if (controls.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-4 p-4">
      {controls.map((spec) => {
        const value = values[spec.variable] ?? spec.defaultValue;

        switch (spec.type) {
          case 'dropdown':
          case 'multi_select':
            return (
              <DropdownControl
                key={spec.variable}
                spec={spec}
                value={String(value ?? '')}
                onChange={(v) => onChange(spec.variable, v)}
              />
            );
          case 'date_range':
            return (
              <DateRangeControl
                key={spec.variable}
                spec={spec}
                value={
                  typeof value === 'object' && value !== null
                    ? (value as { from: string; to: string })
                    : { from: 'now-7d', to: 'now' }
                }
                onChange={(v) => onChange(spec.variable, v)}
              />
            );
          case 'text_input':
            return (
              <TextInputControl
                key={spec.variable}
                spec={spec}
                value={String(value ?? '')}
                onChange={(v) => onChange(spec.variable, v)}
              />
            );
          case 'toggle':
            return (
              <ToggleControl
                key={spec.variable}
                spec={spec}
                value={Boolean(value)}
                onChange={(v) => onChange(spec.variable, v)}
              />
            );
          default:
            return null;
        }
      })}
      {isLoading && (
        <div className="ml-auto flex items-end pb-1">
          <LightboardLoader size={14} />
        </div>
      )}
    </div>
  );
}

'use client';

import type { ControlSpec } from '@lightboard/viz-core';

/** Props for ToggleControl. */
interface ToggleControlProps {
  spec: ControlSpec;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** Toggle/switch control for boolean variables. */
export function ToggleControl({ spec, value, onChange }: ToggleControlProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {spec.label}
      </label>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform"
          style={{
            transform: value ? 'translateX(20px) translateY(2px)' : 'translateX(2px) translateY(2px)',
          }}
        />
      </button>
    </div>
  );
}

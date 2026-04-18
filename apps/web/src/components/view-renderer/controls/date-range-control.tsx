'use client';

import type { ControlSpec } from '@lightboard/viz-core';

/** Props for DateRangeControl. */
interface DateRangeControlProps {
  spec: ControlSpec;
  value: { from: string; to: string };
  onChange: (value: { from: string; to: string }) => void;
}

/** Preset date ranges. */
const PRESETS = [
  { label: 'Last 7 days', from: 'now-7d', to: 'now' },
  { label: 'Last 30 days', from: 'now-30d', to: 'now' },
  { label: 'Last 90 days', from: 'now-90d', to: 'now' },
  { label: 'Last year', from: 'now-1y', to: 'now' },
];

/** Date range control with preset ranges and custom date inputs. */
export function DateRangeControl({ spec, value, onChange }: DateRangeControlProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {spec.label}
      </label>
      <div className="flex items-center gap-2">
        <select
          value={`${value.from}|${value.to}`}
          onChange={(e) => {
            const [from, to] = e.target.value.split('|');
            if (from && to) onChange({ from, to });
          }}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={`${p.from}|${p.to}`}>
              {p.label}
            </option>
          ))}
          <option value="custom|custom">Custom</option>
        </select>

        {value.from !== 'now-7d' && !value.from.startsWith('now-') && (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}

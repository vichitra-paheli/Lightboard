import type { ReactNode } from 'react';

/** Props for {@link Stat}. */
export interface StatProps {
  /** Mono eyebrow describing the metric. */
  label: ReactNode;
  /** The value itself. */
  value: ReactNode;
}

/**
 * Single label/value pair used on the data-source detail summary strip.
 * Mono eyebrow above, body-font value below.
 */
export function Stat({ label, value }: StatProps) {
  return (
    <div>
      <div
        className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </div>
      <div
        className="text-[13px] text-[var(--ink-1)]"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {value}
      </div>
    </div>
  );
}

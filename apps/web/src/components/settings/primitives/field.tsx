import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Props for {@link FieldLabel}. */
export interface FieldLabelProps {
  /** The main label text — rendered in uppercase mono. */
  children: ReactNode;
  /** Optional hint aligned to the baseline on the right (unit, masked state, etc.). */
  hint?: ReactNode;
  /** `htmlFor` target to associate with a labeled input. */
  htmlFor?: string;
}

/**
 * Mono-cased uppercase form label used throughout the settings drawers.
 * Mirrors the handoff's `FieldLabel` primitive.
 */
export function FieldLabel({ children, hint, htmlFor }: FieldLabelProps) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {children}
      </label>
      {hint && (
        <span
          className="text-[11px] text-[var(--ink-5)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

/** Props for {@link Field}. */
export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** When true, the field spans the full width of the parent grid. */
  full?: boolean;
  /** `htmlFor` target to associate the label with the wrapped input. */
  htmlFor?: string;
  children: ReactNode;
}

/** Single-field wrapper — label on top, control below. Use inside {@link FieldGrid}. */
export function Field({ label, hint, full, htmlFor, children }: FieldProps) {
  return (
    <div className={cn(full && 'col-span-full')}>
      <FieldLabel hint={hint} htmlFor={htmlFor}>
        {label}
      </FieldLabel>
      {children}
    </div>
  );
}

/** Props for {@link FieldGrid}. */
export interface FieldGridProps {
  /** Number of columns — 2 is the default used in every drawer. */
  cols?: 1 | 2 | 3;
  children: ReactNode;
}

/** CSS-grid wrapper for a row of {@link Field}s. */
export function FieldGrid({ cols = 2, children }: FieldGridProps) {
  const gridClass = cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return <div className={cn('grid gap-3.5', gridClass)}>{children}</div>;
}

'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Props for {@link Toggle}. */
export interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}

/**
 * Compact amber-on / grey-off switch used in the drawer toggle rows.
 * Matches the handoff `Toggle` primitive (32x18 pill, 14x14 thumb).
 */
export function Toggle({ value, onChange, ariaLabel, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'relative h-[18px] w-8 flex-none rounded-full transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        value ? 'bg-[var(--accent-warm)]' : 'bg-[var(--line-3)]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-[14px] w-[14px] rounded-full transition-all duration-200 ease-[var(--ease-out-quint)]',
          value ? 'left-4 bg-[var(--bg-0)]' : 'left-0.5 bg-[var(--ink-5)]',
        )}
      />
    </button>
  );
}

/** Props for {@link ToggleRow}. */
export interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * Labeled toggle row — card surround with a description below the label.
 * Used for `Require SSL`, `Use this as the workspace default`, etc.
 */
export function ToggleRow({ label, description, value, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[7px] border border-[var(--line-3)] bg-[var(--bg-2)] px-3.5 py-3">
      <div className="min-w-0">
        <div
          className="text-[13px] text-[var(--ink-1)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {label}
        </div>
        {description && (
          <div
            className="mt-0.5 text-[11.5px] text-[var(--ink-5)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {description}
          </div>
        )}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

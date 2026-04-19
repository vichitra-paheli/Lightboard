'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import { forwardRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** Props for {@link TextInput}. */
export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'onChange'> {
  /** When true, the input renders in mono + tabular font (model IDs, hosts). */
  mono?: boolean;
  /** Optional content rendered inside the shell on the right (badge, button). */
  right?: ReactNode;
  /** Controlled value — strings only; use uncontrolled via `defaultValue` for initial state. */
  value?: string;
  /** `onChange` handler receiving the raw string, matching the handoff's signature. */
  onChange?: (value: string) => void;
}

/**
 * Amber-accented text input used across every drawer.
 * Matches the handoff `TextInput` primitive — focus ring + subtle surface
 * shift instead of a hard border change, and an optional `right` slot for
 * badges like "secret".
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { mono, right, value, onChange, onFocus, onBlur, ...rest },
  ref,
) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      className={cn(
        'flex items-center rounded-[7px] border px-2.5',
        'transition-colors duration-150 ease-[var(--ease-out-quint)]',
        focus
          ? 'border-[var(--accent-border)] bg-[var(--bg-4)] shadow-[var(--glow-accent)]'
          : 'border-[var(--line-3)] bg-[var(--bg-2)]',
      )}
    >
      <input
        ref={ref}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        className={cn(
          'flex-1 bg-transparent py-2.5 px-1 text-[var(--ink-1)] outline-none',
          'placeholder:text-[var(--ink-5)]',
          mono ? 'text-[12.5px] tracking-[0.01em]' : 'text-[13px]',
        )}
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
        }}
        {...rest}
      />
      {right && <div className="flex-none pl-2">{right}</div>}
    </div>
  );
});

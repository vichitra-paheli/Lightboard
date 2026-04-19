'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** Single item in a {@link Select}'s options list. */
export interface SelectOption {
  value: string;
  label: string;
  /** Optional inline dot color (CSS color string / token). */
  dot?: string;
  /** Trailing short label rendered in mono on the right (e.g. "sf" for Snowflake). */
  sub?: string;
}

/** Props for {@link Select}. */
export interface SelectProps {
  value: string | null | undefined;
  /** Called with the newly-selected option's `value`. */
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Placeholder shown when nothing is selected. */
  placeholder?: string;
  /** Disable interaction + dim the control. */
  disabled?: boolean;
  /** Accessible label for screen readers when no visible label is adjacent. */
  ariaLabel?: string;
}

/**
 * Styled custom-dropdown used in the LLM routing card and the datasource
 * drawer. Click-outside + Escape close the popover; keyboard arrow nav is
 * handled by the native `<button>` focus ring.
 *
 * Not a `<select>` under the hood — we need the dot + sub decoration the
 * native control can't render. See the `SettingsPrimitives.jsx` handoff for
 * the reference design.
 */
export function Select({ value, onChange, options, placeholder, disabled, ariaLabel }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full rounded-[7px] border px-3 py-2.5 flex items-center gap-2.5',
          'text-[13px] text-[var(--ink-1)]',
          'transition-colors duration-150 ease-[var(--ease-out-quint)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
          open
            ? 'border-[var(--accent-border)] bg-[var(--bg-4)]'
            : 'border-[var(--line-3)] bg-[var(--bg-2)] hover:bg-[var(--bg-4)]',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {current?.dot && (
          <span
            className="h-1.5 w-1.5 rounded-full flex-none"
            style={{ background: current.dot }}
          />
        )}
        <span className="flex-1 text-left truncate">
          {current ? current.label : (placeholder ?? 'Select…')}
        </span>
        {current?.sub && (
          <span
            className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {current.sub}
          </span>
        )}
        <svg width="8" height="8" viewBox="0 0 8 8" className="text-[var(--ink-3)]" aria-hidden="true">
          <path
            d="M1 2.5L4 5.5L7 2.5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-[280px] overflow-y-auto rounded-[7px] border border-[var(--line-3)] bg-[var(--bg-4)] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
          style={{ animation: 'traceIn 140ms ease-out both' }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[12.5px]',
                'hover:bg-[var(--bg-6)] transition-colors',
                o.value === value && 'bg-[var(--accent-bg)] text-[var(--ink-1)]',
              )}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {o.dot && (
                <span className="h-1.5 w-1.5 rounded-full flex-none" style={{ background: o.dot }} />
              )}
              <span className="flex-1 truncate">{o.label}</span>
              {o.sub && (
                <span
                  className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {o.sub}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

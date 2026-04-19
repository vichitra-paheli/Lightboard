'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

/** Shared size token for settings buttons. */
export type SettingsButtonSize = 'sm' | 'md';

/** Common props shared across all three settings button variants. */
interface BaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: SettingsButtonSize;
  children: ReactNode;
}

const sizeClass: Record<SettingsButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[12px]',
  md: 'px-4 py-2 text-[13px]',
};

/**
 * Primary amber-filled button used for the marquee action on each settings
 * page (`+ Add model`, `+ Add datasource`, `Refresh schema`).
 */
export const PrimaryButton = forwardRef<HTMLButtonElement, BaseButtonProps>(
  function PrimaryButton({ size = 'md', className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-[7px] font-medium whitespace-nowrap',
          'text-[var(--bg-0)] bg-[var(--accent-warm)] hover:bg-[var(--accent)]',
          'transition-colors duration-150 ease-[var(--ease-out-quint)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          sizeClass[size],
          className,
        )}
        style={{ fontFamily: 'var(--font-body)' }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/** Props for {@link SecondaryButton}. Adds the `danger` tone. */
interface SecondaryButtonProps extends BaseButtonProps {
  /** When true, reframes the button with the destructive palette. */
  danger?: boolean;
}

/**
 * Low-key outlined button used for `Cancel`, `Edit connection`, `Run test`,
 * `Remove`. The `danger` variant flips to the destructive border + ink.
 */
export const SecondaryButton = forwardRef<HTMLButtonElement, SecondaryButtonProps>(
  function SecondaryButton({ size = 'md', className, children, danger, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-[7px] font-medium',
          'border transition-colors duration-150 ease-[var(--ease-out-quint)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          danger
            ? 'border-[var(--line-3)] text-[var(--ink-2)] hover:text-[#E88B8B] hover:border-[#3B1F1F] hover:bg-[#1C1315]'
            : 'border-[var(--line-3)] text-[var(--ink-2)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-6)]',
          sizeClass[size],
          className,
        )}
        style={{ fontFamily: 'var(--font-body)' }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/**
 * Transparent ghost button used as a tertiary action (typically `Cancel` in
 * drawer footers). Lightest visual weight — just ink + background tint on hover.
 */
export const GhostButton = forwardRef<HTMLButtonElement, BaseButtonProps>(
  function GhostButton({ size = 'md', className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md',
          'text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--bg-6)]',
          'transition-colors duration-150 ease-[var(--ease-out-quint)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          size === 'sm' ? 'px-2.5 py-1.5 text-[12px]' : 'px-3 py-1.5 text-[12.5px]',
          className,
        )}
        style={{ fontFamily: 'var(--font-body)' }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Props for {@link IconButton}. Extends the native button element so callers
 * can pass `onClick`, `aria-label`, `disabled`, etc. directly.
 */
export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Square 30x30 icon button used throughout the app shell — hamburger toggle,
 * composer controls (future), filmstrip toggle (future). Mirrors the
 * handoff's `IconButton` primitive (`Lightboard-handoff/project/components/Shell.jsx`)
 * but swaps the inline styles for token-backed Tailwind classes so the hover
 * states live alongside the rest of the app's design system.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, type = 'button', ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg',
          'bg-transparent text-[var(--ink-3)] transition-[background-color,color]',
          'duration-150 ease-out hover:bg-[var(--bg-6)] hover:text-[var(--ink-1)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    );
  },
);

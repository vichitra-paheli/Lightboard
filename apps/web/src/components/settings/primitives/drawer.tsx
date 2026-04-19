'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { cn } from '@/lib/utils';

/** Props for {@link Drawer}. */
export interface DrawerProps {
  /** Display-font title rendered in the drawer header. */
  title: ReactNode;
  /** Optional secondary line under the title. */
  subtitle?: ReactNode;
  /** Called when the user hits Escape or clicks the scrim. */
  onClose: () => void;
  /** Drawer body — already padded; drop a `<FieldGrid>` straight in. */
  children: ReactNode;
  /** Footer content — buttons, typically right-aligned. */
  footer?: ReactNode;
  /** Use the wider 620px variant (LLM drawer needs this). */
  wide?: boolean;
  /** Accessible name for the close button. */
  closeLabel?: string;
}

/**
 * Right-side modal drawer — token-backed surface, click-outside / Escape
 * dismiss, locked body scroll. Mirrors the handoff's `Drawer` primitive.
 */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
  closeLabel = 'Close drawer',
}: DrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock page scroll while the drawer is open so the transform doesn't
    // reveal the underlying scroll position.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute right-0 top-0 bottom-0 flex flex-col bg-[var(--bg-2)]',
          'border-l border-[var(--line-1)] shadow-[-20px_0_60px_rgba(0,0,0,0.5)]',
          'max-w-[92vw]',
          wide ? 'w-[620px]' : 'w-[520px]',
        )}
        style={{ animation: 'traceIn 180ms ease-out both' }}
      >
        <div className="flex-none flex items-start justify-between gap-4 border-b border-[var(--line-1)] px-7 pt-5 pb-4">
          <div className="min-w-0">
            <div
              className="text-[18px] font-medium text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                className="mt-1 text-[12.5px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-[var(--ink-3)] hover:bg-[var(--bg-6)] hover:text-[var(--ink-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-7 py-6">{children}</div>
        {footer && (
          <div className="flex-none flex items-center justify-end gap-2 border-t border-[var(--line-1)] bg-[var(--bg-1)] px-7 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

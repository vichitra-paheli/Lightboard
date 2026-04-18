'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Grid3x3 } from 'lucide-react';

/**
 * Props for {@link FilmstripButton}.
 */
interface FilmstripButtonProps {
  /** Whether the filmstrip panel is currently open. Drives the active fill. */
  open: boolean;
  /** Fired on click — parent flips the open/closed state. */
  onToggle: () => void;
  /** Number of views in history. Rendered inside a small mono count pill. */
  count: number;
}

/**
 * Rounded pill toggle that opens / closes the filmstrip right slide-out.
 *
 * Layout matches the editorial handoff: `[icon] Filmstrip [6]` — a grid
 * glyph on the left, a mid-weight label, and a small mono count badge on
 * the right. Positioning is owned by the page chrome (ExplorePageClient
 * fixes it to the viewport's top-right, just below the 56px top bar) so
 * the filmstrip panel — which slides in at `position: fixed; top: 0;
 * right: 0` — naturally covers the button via its higher z-index.
 *
 * When open (panel expanded), the button adopts `--accent-bg` +
 * `--accent-border` so it visually binds to the active card styling inside
 * the panel. Hover/idle states use `--bg-6` / transparent so the button
 * feels contiguous with the thread background.
 *
 * Hidden when `count === 0` — an empty filmstrip would dead-end a click.
 * The empty-state surface is the thread itself, not a zero-count button.
 */
export function FilmstripButton({ open, onToggle, count }: FilmstripButtonProps) {
  const t = useTranslations('explore');
  const [hover, setHover] = useState(false);

  if (count <= 0) return null;

  const ariaLabel = open ? t('filmstripClose') : t('filmstripOpen');

  // Precompute the three background states so the inline style is a single
  // conditional rather than three nested ternaries in the `style` prop.
  const background = open
    ? 'var(--accent-bg)'
    : hover
      ? 'var(--bg-6)'
      : 'var(--bg-4)';
  const borderColor = open ? 'var(--accent-border)' : 'var(--line-3)';
  const color = open ? 'var(--accent-ink)' : 'var(--ink-2)';

  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-pressed={open}
      data-filmstrip-button
      className="inline-flex items-center gap-2 transition-colors"
      style={{
        padding: '7px 10px 7px 10px',
        borderRadius: 999,
        background,
        border: `1px solid ${borderColor}`,
        color,
        fontFamily: 'var(--font-body)',
        fontSize: 12,
        lineHeight: 1,
        cursor: 'pointer',
      }}
    >
      <Grid3x3 size={13} aria-hidden="true" strokeWidth={1.25} />
      <span>{t('filmstripLabel')}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.04em',
          color: open ? 'var(--accent-ink)' : 'var(--ink-5)',
          padding: '2px 6px',
          borderRadius: 6,
          background: open ? 'var(--bg-7)' : 'var(--bg-6)',
          minWidth: 18,
          textAlign: 'center',
        }}
      >
        {count}
      </span>
    </button>
  );
}

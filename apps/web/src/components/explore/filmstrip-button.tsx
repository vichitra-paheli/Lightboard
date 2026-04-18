'use client';

import { useTranslations } from 'next-intl';
import { PanelRight } from 'lucide-react';

/**
 * Props for {@link FilmstripButton}.
 */
interface FilmstripButtonProps {
  /** Whether the filmstrip panel is currently open. Drives the active fill. */
  open: boolean;
  /** Fired on click — parent flips the open/closed state. */
  onToggle: () => void;
}

/**
 * Small icon toggle that opens / closes the filmstrip right slide-out.
 * Fixed-positioned at the top-right of the viewport so it floats above the
 * thread without occupying thread chrome space — the thread itself is a
 * pure content column in PR 4's editorial layout.
 *
 * When open, the button fills with `--accent-bg` to echo the active-card
 * styling inside the panel. That reuses the same accent token both surfaces
 * share, so theme tweaks propagate without touching this component.
 */
export function FilmstripButton({ open, onToggle }: FilmstripButtonProps) {
  const t = useTranslations('explore');
  const label = open ? t('filmstripClose') : t('filmstripOpen');

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={open}
      data-filmstrip-button
      className="fixed right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
      style={{
        // Sit above the panel (z=5) and above the composer (z=10) so the
        // button is always reachable while the panel is animating.
        zIndex: 20,
        background: open ? 'var(--accent-bg)' : 'transparent',
        border: `1px solid ${open ? 'var(--accent-border)' : 'var(--line-3)'}`,
        color: open ? 'var(--ink-1)' : 'var(--ink-2)',
      }}
      onMouseEnter={(e) => {
        if (!open) e.currentTarget.style.background = 'var(--bg-6)';
      }}
      onMouseLeave={(e) => {
        if (!open) e.currentTarget.style.background = 'transparent';
      }}
    >
      <PanelRight size={16} aria-hidden="true" />
    </button>
  );
}

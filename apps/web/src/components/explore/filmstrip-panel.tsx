'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import type { ViewSpec } from '@lightboard/viz-core';
import type { HtmlView } from '@/components/view-renderer';
import { detectKind, ProceduralThumbnail } from './procedural-thumbnail';
import styles from './filmstrip-panel.module.css';

/**
 * A single entry in the filmstrip. Extends the raw view with presentation
 * metadata the panel needs — timestamp, optional pinned flag (future
 * persistence, off by default today). We keep `view` nested rather than
 * flattening so {@link ProceduralThumbnail} can consume the same shape
 * without knowing about filmstrip bookkeeping.
 */
export interface FilmstripItem {
  /** Stable id — used as the React key and for the click callback. */
  id: string;
  /** The underlying view. Drives the thumbnail + title + chart kind tag. */
  view: HtmlView | ViewSpec;
  /** Optional human-readable timestamp (e.g. `"2:14pm"`). */
  timestamp?: string;
  /** Optional pinned flag — renders a mono gold `PINNED` badge when true. */
  pinned?: boolean;
}

/**
 * Props for {@link FilmstripPanel}.
 */
interface FilmstripPanelProps {
  /** Whether the panel is visible. When false the panel slides to `translateX(100%)`. */
  open: boolean;
  /** Handler for the close button in the header. */
  onClose: () => void;
  /** Filmstrip items, oldest-first. The panel reverses them so newest appears first. */
  items: FilmstripItem[];
  /**
   * Index into the **unreversed** `items` array identifying the currently
   * active view. Pass `-1` when nothing is active. Cards matching this
   * index render with the `--accent-bg` / `--accent-border` active styling.
   */
  activeIndex: number;
  /** Fired when a card is clicked. Receives the index into the unreversed `items` array. */
  onSelect: (index: number) => void;
}

/**
 * Right slide-out filmstrip — ports `Lightboard-handoff/project/components/Filmstrip.jsx`.
 *
 * Always mounted so the slide animation works in both directions; the `open`
 * prop toggles a CSS class that flips a `translateX` transform. The panel
 * keeps its own scroll position and focus restoration for free because it
 * never unmounts.
 *
 * Cards are rendered newest-first but {@link FilmstripPanelProps.activeIndex}
 * still refers to the **unreversed** order so callers can use
 * `viewHistory.length - 1` for "latest" without knowing about the reversal.
 *
 * Accessibility:
 * - Panel is hidden from assistive tech when closed via `aria-hidden`.
 * - The close button is keyboard-focusable; Escape handling is managed by
 *   the parent because the filmstrip button itself may want to steal the
 *   Escape handler.
 * - Cards are real `<button>`s so Enter / Space activate them for free.
 *
 * Reduced motion: the slide transition is stripped via `@media
 * (prefers-reduced-motion: reduce)` in the sibling CSS module. The panel
 * still appears / disappears — it just snaps instead of sliding.
 */
export function FilmstripPanel({
  open,
  onClose,
  items,
  activeIndex,
  onSelect,
}: FilmstripPanelProps) {
  const t = useTranslations('explore');
  const listRef = useRef<HTMLDivElement>(null);

  // When a new item arrives we want the newest (top of the reversed list) to
  // be visible, not a stale mid-scroll position. Scroll to top on each
  // length change.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [items.length]);

  // Render newest-first. We map through the reversed array but still call
  // `onSelect` with the **original** index so the caller's `viewHistory`
  // bookkeeping stays intact.
  const displayItems = items
    .map((item, index) => ({ item, index }))
    .reverse();

  const panelClassName = open
    ? `${styles.panel} ${styles.panelOpen}`
    : styles.panel;

  return (
    <aside
      className={panelClassName}
      aria-hidden={!open}
      aria-label={t('filmstripEyebrow')}
      data-filmstrip-panel
      data-filmstrip-open={open ? 'true' : 'false'}
    >
      <div className={styles.header}>
        <div>
          <div className="lb-eyebrow">{t('filmstripEyebrow')}</div>
          <div className={styles.count}>
            {t('filmstripCount', { count: items.length })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          aria-label={t('filmstripClose')}
          // Only reachable via tab when the panel is open — a closed panel
          // should not surface a tabbable child.
          tabIndex={open ? 0 : -1}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
            <path
              d="M2 2l7 7M9 2l-7 7"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div ref={listRef} className={styles.list}>
        {items.length === 0 ? (
          <div className={styles.emptyState}>{t('filmstripEmpty')}</div>
        ) : (
          displayItems.map(({ item, index }) => (
            <FilmstripCard
              key={item.id}
              item={item}
              isActive={index === activeIndex}
              tabbable={open}
              onClick={() => onSelect(index)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

/** Props for {@link FilmstripCard}. */
interface FilmstripCardProps {
  item: FilmstripItem;
  isActive: boolean;
  tabbable: boolean;
  onClick: () => void;
}

/**
 * One card inside the filmstrip list: procedural thumbnail, view title,
 * mono meta line (`<timestamp> · <kind>`), plus a pinned badge when the
 * item is pinned. Split out so the parent's render remains declarative and
 * so component tests can target a single card without wading through the
 * panel chrome.
 */
function FilmstripCard({ item, isActive, tabbable, onClick }: FilmstripCardProps) {
  const t = useTranslations('explore');
  const kind = detectKind(item.view);
  const title = item.view.title ?? 'Untitled view';
  const meta = [item.timestamp, kind].filter(Boolean).join(' · ');
  const className = isActive
    ? `${styles.card} ${styles.cardActive}`
    : styles.card;

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      data-filmstrip-card
      data-filmstrip-active={isActive ? 'true' : 'false'}
      aria-pressed={isActive}
      tabIndex={tabbable ? 0 : -1}
    >
      <ProceduralThumbnail view={item.view} kind={kind} />
      <div className={styles.cardTitleRow}>
        <div
          className={
            isActive
              ? `${styles.cardTitle} ${styles.cardTitleActive}`
              : styles.cardTitle
          }
        >
          {title}
        </div>
        {item.pinned && (
          <span className={styles.pinnedBadge}>{t('filmstripPinned')}</span>
        )}
      </div>
      {meta && <div className={styles.cardMeta}>{meta}</div>}
    </button>
  );
}

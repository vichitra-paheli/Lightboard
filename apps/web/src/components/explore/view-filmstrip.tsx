'use client';

import { useEffect, useRef } from 'react';
import type { HtmlView } from '@/components/view-renderer';

/** Props for the ViewFilmstrip component. */
interface ViewFilmstripProps {
  views: HtmlView[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Horizontal scrollable strip of previous visualization thumbnails.
 * Click any card to restore that view. Auto-scrolls to the newest view.
 */
export function ViewFilmstrip({ views, activeIndex, onSelect }: ViewFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest view
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [views.length]);

  if (views.length <= 1) return null;

  return (
    <div
      className="shrink-0 border-t"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto p-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {views.map((view, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className="shrink-0 rounded-md px-3 py-2 text-left transition-colors"
            style={{
              width: 140,
              backgroundColor: i === activeIndex
                ? 'var(--color-accent)'
                : 'var(--color-muted)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: i === activeIndex
                ? 'var(--color-accent-foreground)'
                : 'transparent',
            }}
          >
            <p
              className="truncate text-xs font-medium"
              style={{ color: 'var(--color-foreground)' }}
            >
              {view.title ?? `View ${i + 1}`}
            </p>
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: 'var(--color-muted-foreground)' }}
            >
              {view.description ?? ''}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

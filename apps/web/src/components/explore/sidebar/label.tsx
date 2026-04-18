'use client';

import type { ReactNode } from 'react';

/**
 * Props for {@link Label}.
 */
interface LabelProps {
  children: ReactNode;
}

/**
 * Mono eyebrow label used above sidebar sections (`Database`, `Conversations`).
 * Matches the design handoff's `Label` helper — uppercase mono, ink-5, 9.5px
 * with tracked-out letter spacing. Not translatable here because these
 * section labels are fixed editorial copy; the surrounding section content
 * handles i18n.
 */
export function Label({ children }: LabelProps) {
  return (
    <div
      className="lb-eyebrow"
      // The shared lb-eyebrow class renders the correct color + weight, no
      // extra styling needed here.
    >
      {children}
    </div>
  );
}

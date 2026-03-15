'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Props for ThinkingState. */
interface ThinkingStateProps {
  /** The accumulated thinking/reasoning text from the agent. */
  thinking: string;
  /** Whether the agent is still actively thinking. */
  isActive?: boolean;
}

/**
 * Collapsible display for agent thinking/reasoning text.
 * Shows a subtle muted section with a chevron toggle.
 * Collapsed by default. Pulses while the agent is actively thinking.
 */
export function ThinkingState({ thinking, isActive }: ThinkingStateProps) {
  const t = useTranslations('chat');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
      >
        {isActive && (
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
        )}
        <ChevronRight
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
        <span>{isActive ? t('thinking') : t('thinkingLabel')}</span>
      </button>
      {isOpen && (
        <div className="mt-1 rounded-md bg-muted px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {thinking}
        </div>
      )}
    </div>
  );
}

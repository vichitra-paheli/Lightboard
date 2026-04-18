'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Props for {@link ThinkingPart}.
 */
interface ThinkingPartProps {
  /** Accumulated thinking text from the agent. */
  text: string;
  /** Whether the agent is still actively thinking. Shows a pulse-dot. */
  isActive?: boolean;
}

/**
 * Editorial-log port of the legacy `<ThinkingState>` component. Rendered
 * as a collapsible inline block whose position inside the turn is
 * determined by the `parts[]` order — so a `thinking` part emitted before
 * any tool call now renders above the trace cluster rather than inside a
 * single "trace card" above the agent text.
 *
 * Collapsed by default. The pulse dot uses the `pulse` keyframe already
 * registered in globals.css, so no new CSS is added here.
 */
export function ThinkingPart({ text, isActive }: ThinkingPartProps) {
  const t = useTranslations('chat');
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="ml-[40px]">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        type="button"
        className="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
        style={{ color: 'var(--ink-4)' }}
      >
        {isActive && (
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: 'var(--kind-narrate)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
        )}
        <ChevronRight
          className={`h-3 w-3 transition-transform ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
        <span
          style={{
            fontFamily:
              'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {isActive ? t('thinking') : t('thinkingLabel')}
        </span>
      </button>
      {isOpen && (
        <div
          className="mt-1 whitespace-pre-wrap rounded-md px-3 py-2 text-xs"
          style={{
            background: 'var(--bg-3)',
            border: '1px solid var(--line-2)',
            color: 'var(--ink-3)',
            marginLeft: 8,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';

/** Props for ThinkingSection. */
interface ThinkingSectionProps {
  thinking: string;
  isStreaming?: boolean;
}

/** Collapsible section showing AI thinking/reasoning with animated dots during streaming. */
export function ThinkingSection({ thinking, isStreaming }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs font-medium transition-colors"
        style={{ color: 'var(--color-muted-foreground)' }}
        aria-expanded={isExpanded}
        data-testid="thinking-toggle"
      >
        <span
          className="inline-block transition-transform"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          &#9654;
        </span>
        <span>Thinking</span>
        {isStreaming && <ThinkingDots />}
      </button>
      {isExpanded && (
        <div
          className="mt-1.5 rounded-md px-3 py-2 text-xs whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--color-muted)',
            color: 'var(--color-muted-foreground)',
          }}
          data-testid="thinking-content"
        >
          {thinking}
        </div>
      )}
    </div>
  );
}

/** Animated dots shown while the AI is actively thinking. */
function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5" data-testid="thinking-dots" aria-label="Thinking in progress">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full animate-pulse"
          style={{
            backgroundColor: 'var(--color-muted-foreground)',
            animationDelay: `${i * 200}ms`,
          }}
        />
      ))}
    </span>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/**
 * Rounded-pill model selector living in the right column of the top bar.
 *
 * TODO (backend-ui-polish-followups.md — "Agent-picker wiring"): hook this up
 * to a real model list + selection state. For now the button is a no-op
 * placeholder that renders the static "Haiku 4.5" label from the design mock.
 */
export function AgentPicker() {
  const t = useTranslations('topBar');

  return (
    <button
      type="button"
      aria-label={t('changeModel')}
      onClick={() => {
        // TODO: open the model-picker dropdown — see
        // documentation/backend-ui-polish-followups.md#agent-picker-wiring.
      }}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-[10px] py-[5px] pl-2',
        'border border-[var(--line-1)] bg-transparent transition-all duration-150 ease-out',
        'hover:bg-[var(--bg-6)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]',
      )}
    >
      <span
        aria-hidden="true"
        className="h-[6px] w-[6px] rounded-full bg-[var(--kind-narrate)]"
        style={{ boxShadow: '0 0 0 2px rgba(125,180,105,0.15)' }}
      />
      <span className="text-[12px] text-[var(--ink-1)]">Haiku 4.5</span>
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        aria-hidden="true"
        className="text-[var(--ink-4,#6B6B73)]"
      >
        <path
          d="M1 2.5L4 5.5L7 2.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </button>
  );
}

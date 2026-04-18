'use client';

import { useTranslations } from 'next-intl';

/**
 * Props for {@link NewChatButton}.
 */
interface NewChatButtonProps {
  onClick: () => void;
}

/**
 * Full-width "New conversation" button at the bottom of the Explore sidebar.
 * Ports the handoff's `NewChatButton` — subtle bordered pill with a `⌘ K`
 * mono hint on the right-hand side.
 *
 * The label and keyboard hint are separate translation keys so future locales
 * can swap the action verb and the shortcut symbol independently.
 */
export function NewChatButton({ onClick }: NewChatButtonProps) {
  const t = useTranslations('explore');

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg px-3 py-[9px] text-left transition-colors"
      style={{
        background: 'transparent',
        border: '1px solid var(--line-3)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span className="text-[12.5px]" style={{ color: 'var(--ink-1)' }}>
        {t('newChat')}
      </span>
      <span
        className="font-mono"
        style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 10,
          color: 'var(--ink-5)',
        }}
      >
        {t('keyboardShortcut')}
      </span>
    </button>
  );
}

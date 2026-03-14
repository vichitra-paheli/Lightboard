'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

/** Props for ChatInput. */
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

/** Chat message input with Cmd+Enter to send. */
export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const t = useTranslations('explore');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex gap-2 p-3" style={{ borderTopWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('placeholder')}
        disabled={disabled}
        rows={2}
        className="flex-1 resize-none rounded-md px-3 py-2 text-sm"
        style={{
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--color-input)',
          backgroundColor: 'transparent',
          color: 'var(--color-foreground)',
        }}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="self-end rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        style={{
          backgroundColor: 'var(--color-primary)',
          color: 'var(--color-primary-foreground)',
        }}
      >
        {t('send')}
      </button>
    </div>
  );
}

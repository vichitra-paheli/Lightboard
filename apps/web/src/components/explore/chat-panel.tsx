'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { ChatInput } from './chat-input';
import { ChatMessage, type ChatMessageData } from './chat-message';

/** Props for ChatPanel. */
interface ChatPanelProps {
  messages: ChatMessageData[];
  onSend: (message: string) => void;
  onStop: () => void;
  onNewConversation: () => void;
  isStreaming: boolean;
}

/** Chat panel with message history, input, and new conversation button. */
export function ChatPanel({ messages, onSend, onStop, onNewConversation, isStreaming }: ChatPanelProps) {
  const t = useTranslations('explore');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottomWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
          {t('title')}
        </h3>
        <button
          onClick={onNewConversation}
          className="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          style={{
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--color-border)',
            color: 'var(--color-muted-foreground)',
          }}
        >
          {t('newConversation')}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
              {t('placeholder')}
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>

      {/* Input */}
      <ChatInput onSend={onSend} onStop={onStop} isStreaming={isStreaming} />
    </div>
  );
}

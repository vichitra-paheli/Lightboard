'use client';

import { ChartThemeProvider, type ViewSpec } from '@lightboard/viz-core';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { ViewRenderer } from '@/components/view-renderer';
import { ChatPanel } from './chat-panel';
import type { ChatMessageData } from './chat-message';
import { DataSourceSelector, type DataSourceOption } from './data-source-selector';

/** Mock data sources for Phase 1 (will be fetched from API later). */
const MOCK_SOURCES: DataSourceOption[] = [];

/**
 * Client-side Explore page component.
 * Split panel: chat on the left, view renderer on the right.
 */
export function ExplorePageClient() {
  const t = useTranslations('explore');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewSpec | null>(null);
  const [viewData, setViewData] = useState<Record<string, unknown>[] | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K to focus data source selector
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const select = document.querySelector<HTMLSelectElement>('[data-source-selector]');
        select?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSend = useCallback(
    async (message: string) => {
      const userMsg: ChatMessageData = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      try {
        // Call the agent API endpoint
        const response = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            sourceId: selectedSource,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `Agent request failed: ${response.status}`);
        }

        const result = await response.json();

        // Add assistant response
        const assistantMsg: ChatMessageData = {
          id: `msg_${Date.now()}_reply`,
          role: 'assistant',
          content: result.text ?? t('noResponse'),
          toolCalls: result.toolCalls?.map((tc: { name: string; isError?: boolean }) => ({
            name: tc.name,
            status: tc.isError ? 'error' : 'done',
          })),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // If the agent created/modified a view, update the right panel
        if (result.viewSpec) {
          setCurrentView(result.viewSpec);
          setViewData(result.queryResult?.rows ?? null);
        }
      } catch (err) {
        const errorMsg: ChatMessageData = {
          id: `msg_${Date.now()}_error`,
          role: 'assistant',
          content: err instanceof Error ? err.message : t('noResponse'),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsStreaming(false);
      }
    },
    [selectedSource, t],
  );

  const handleNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentView(null);
    setViewData(null);
  }, []);

  return (
    <ChartThemeProvider mode="dark">
      <div className="flex h-full flex-col">
        {/* Data source selector */}
        <DataSourceSelector
          sources={MOCK_SOURCES}
          selectedId={selectedSource}
          onChange={setSelectedSource}
        />

        {/* Split panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Chat */}
          <div
            className="flex w-[400px] shrink-0 flex-col"
            style={{ borderRightWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border)' }}
          >
            <ChatPanel
              messages={messages}
              onSend={handleSend}
              onNewConversation={handleNewConversation}
              isStreaming={isStreaming}
            />
          </div>

          {/* Right: View */}
          <div className="flex-1 overflow-auto">
            {currentView ? (
              <ViewRenderer
                spec={currentView}
                data={viewData}
                isLoading={isStreaming}
                error={null}
                width={800}
                height={600}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-medium" style={{ color: 'var(--color-foreground)' }}>
                    {t('title')}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--color-muted-foreground)' }}>
                    {t('placeholder')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ChartThemeProvider>
  );
}

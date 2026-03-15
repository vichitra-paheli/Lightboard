'use client';

import {
  ChartThemeProvider,
  defaultPanelRegistry,
  barChartPlugin,
  timeSeriesLinePlugin,
  statCardPlugin,
  dataTablePlugin,
  type ViewSpec,
} from '@lightboard/viz-core';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

// Register chart panel plugins on module load
if (!defaultPanelRegistry.has('bar-chart')) {
  defaultPanelRegistry.register(barChartPlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0]);
  defaultPanelRegistry.register(timeSeriesLinePlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0]);
  defaultPanelRegistry.register(statCardPlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0]);
  defaultPanelRegistry.register(dataTablePlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0]);
}
import { ViewRenderer } from '@/components/view-renderer';
import { ChatPanel } from './chat-panel';
import type { ChatMessageData, ToolCallData, AgentIndicatorData } from './chat-message';
import { DataSourceSelector, type DataSourceOption } from './data-source-selector';
import { parseSSE } from '@/lib/sse-parser';

/**
 * Client-side Explore page component.
 * Split panel: chat on the left, view renderer on the right.
 * Supports SSE streaming for real-time agent responses.
 */
export function ExplorePageClient() {
  const t = useTranslations('explore');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<ViewSpec | null>(null);
  const [viewData, setViewData] = useState<Record<string, unknown>[] | null>(null);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data sources from API on mount
  useEffect(() => {
    async function loadSources() {
      try {
        const res = await fetch('/api/data-sources');
        if (res.ok) {
          const data = await res.json();
          setDataSources(
            data.dataSources.map((ds: { id: string; name: string; type: string }) => ({
              id: ds.id,
              name: ds.name,
              type: ds.type,
            })),
          );
        }
      } catch {
        // Silently fail — dropdown will be empty
      }
    }
    loadSources();
  }, []);

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

  /** Consumes an SSE stream and updates messages progressively. */
  const consumeSSEStream = useCallback(
    async (response: Response, assistantMsgId: string) => {
      // Track the last successful query result from run_sql or execute_query
      let lastQueryRows: Record<string, unknown>[] | null = null;

      for await (const sseEvent of parseSSE(response)) {
        try {
          const data = JSON.parse(sseEvent.data);

          switch (sseEvent.event) {
            case 'thinking':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, thinking: (m.thinking ?? '') + (data.text ?? '') }
                    : m,
                ),
              );
              break;

            case 'text':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, content: m.content + (data.text ?? '') }
                    : m,
                ),
              );
              break;

            case 'tool_start': {
              const newToolCall: ToolCallData = {
                name: data.name,
                status: 'running' as const,
                ...(data.input ? { input: data.input } : {}),
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: [...(m.toolCalls ?? []), newToolCall],
                      }
                    : m,
                ),
              );
              break;
            }

            case 'tool_end':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.name === data.name && tc.status === 'running'
                            ? {
                                ...tc,
                                status: data.isError ? ('error' as const) : ('done' as const),
                                ...(data.result !== undefined ? { result: String(data.result) } : {}),
                                ...(data.durationMs !== undefined ? { durationMs: data.durationMs } : {}),
                              }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
              // Capture query results from run_sql or execute_query for chart rendering
              if (!data.isError && (data.name === 'run_sql' || data.name === 'execute_query')) {
                try {
                  const parsed = JSON.parse(data.result);
                  if (parsed.rows) {
                    lastQueryRows = parsed.rows;
                  }
                } catch { /* ignore parse errors */ }
              }
              break;

            case 'agent_start': {
              const newDelegation: AgentIndicatorData = {
                agent: data.agent,
                task: data.task,
                status: 'running' as const,
              };
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        agentDelegations: [
                          ...(m.agentDelegations ?? []),
                          newDelegation,
                        ],
                      }
                    : m,
                ),
              );
              break;
            }

            case 'agent_end':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        agentDelegations: m.agentDelegations?.map((d) =>
                          d.agent === data.agent && d.status === 'running'
                            ? {
                                ...d,
                                status: 'done' as const,
                                ...(data.summary ? { summary: data.summary } : {}),
                              }
                            : d,
                        ),
                      }
                    : m,
                ),
              );
              break;

            case 'view_created':
              if (data.viewSpec) {
                setCurrentView(data.viewSpec);
                // Use query results: from event, from captured tool results, or fetch
                if (data.queryResult?.rows) {
                  setViewData(data.queryResult.rows);
                } else if (lastQueryRows) {
                  setViewData(lastQueryRows);
                } else {
                  // Otherwise, execute the ViewSpec's query to get data
                  const query = data.viewSpec.query;
                  const sourceId = query?.source;
                  if (sourceId) {
                    fetch(`/api/data-sources/${sourceId}/query`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ queryIR: query }),
                    })
                      .then((r) => (r.ok ? r.json() : null))
                      .then((result) => {
                        if (result?.rows) {
                          setViewData(result.rows);
                        }
                      })
                      .catch(() => {
                        // Query execution failed — view will show loading state
                      });
                  }
                }
              }
              break;

            case 'done':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
                ),
              );
              setIsStreaming(false);
              if (data.conversationId) {
                setConversationId(data.conversationId);
              }
              break;

            case 'error':
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: m.content
                          ? `${m.content}\n\nError: ${data.error}`
                          : data.error,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
              break;
          }
        } catch {
          // Skip malformed SSE events
        }
      }

      // Ensure streaming flag is cleared even if no done event received
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
    },
    [],
  );

  const handleSend = useCallback(
    async (message: string) => {
      // Abort any in-progress stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMsg: ChatMessageData = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content: message,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantMsgId = `msg_${Date.now()}_reply`;

      // Create optimistic empty assistant message
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          agentDelegations: [],
          isStreaming: true,
        },
      ]);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch('/api/agent/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            message,
            sourceId: selectedSource,
            conversationId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error ?? `Agent request failed: ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type') ?? '';

        if (contentType.includes('text/event-stream')) {
          // SSE streaming mode
          await consumeSSEStream(response, assistantMsgId);
        } else {
          // Fallback to JSON mode
          const result = await response.json();

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: result.text ?? t('noResponse'),
                    toolCalls: result.toolCalls?.map(
                      (tc: { name: string; status?: string }) => ({
                        name: tc.name,
                        status: (tc.status as 'done' | 'error') ?? 'done',
                      }),
                    ),
                    isStreaming: false,
                  }
                : m,
            ),
          );

          if (result.conversationId) {
            setConversationId(result.conversationId);
          }

          if (result.viewSpec) {
            setCurrentView(result.viewSpec);
            if (result.queryResult?.rows) {
              setViewData(result.queryResult.rows);
            } else {
              // Execute the ViewSpec's query to get data for the chart
              const query = result.viewSpec.query;
              const srcId = query?.source;
              if (srcId) {
                fetch(`/api/data-sources/${srcId}/query`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ queryIR: query }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((qr) => { if (qr?.rows) setViewData(qr.rows); })
                  .catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // Stream was cancelled — mark message as done
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: err instanceof Error ? err.message : t('noResponse'),
                    isStreaming: false,
                  }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [selectedSource, conversationId, t, consumeSSEStream],
  );

  /** Stop the current agent stream. */
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  }, []);

  const handleNewConversation = useCallback(() => {
    handleStop();
    setMessages([]);
    setCurrentView(null);
    setViewData(null);
    setConversationId(null);
  }, [handleStop]);

  return (
    <ChartThemeProvider mode="dark">
      <div className="flex h-full flex-col">
        {/* Data source selector */}
        <DataSourceSelector
          sources={dataSources}
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
              onStop={handleStop}
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

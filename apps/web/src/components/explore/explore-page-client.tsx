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
import { ViewRenderer, HtmlViewRenderer, type HtmlView } from '@/components/view-renderer';
import { ChatPanel } from './chat-panel';
import type { ChatMessageData, ToolCallData, AgentIndicatorData } from './chat-message';
import { DataSourceSelector, type DataSourceOption } from './data-source-selector';
import { SchemaCurationPanel } from './schema-curation-panel';
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
  const [currentView, setCurrentView] = useState<ViewSpec | HtmlView | null>(null);
  const [viewData, setViewData] = useState<Record<string, unknown>[] | null>(null);

  /** Type guard: HTML views have an `html` property. */
  const isHtmlView = (view: ViewSpec | HtmlView): view is HtmlView => 'html' in view;
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [schemaCuration, setSchemaCuration] = useState<{
    phase: 'callout' | 'generating' | 'editing' | 'saving';
    markdown: string;
  } | null>(null);
  const schemaGenerationTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data sources from API on mount
  useEffect(() => {
    async function loadSources() {
      try {
        const res = await fetch('/api/data-sources');
        if (res.ok) {
          const data = await res.json();
          setDataSources(
            data.dataSources.map((ds: { id: string; name: string; type: string; config?: Record<string, unknown> }) => ({
              id: ds.id,
              name: ds.name,
              type: ds.type,
              hasSchemaDoc: !!ds.config?.schemaDoc,
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

  // Show schema curation callout when a source without schemaDoc is selected
  useEffect(() => {
    if (!selectedSource) {
      setSchemaCuration(null);
      schemaGenerationTriggered.current = false;
      return;
    }
    // Don't re-show callout if generation was already triggered in this session
    if (schemaGenerationTriggered.current) return;
    const source = dataSources.find((s) => s.id === selectedSource);
    if (source && !source.hasSchemaDoc && !currentView) {
      setSchemaCuration({ phase: 'callout', markdown: '' });
    } else {
      setSchemaCuration(null);
    }
  }, [selectedSource, dataSources, currentView]);

  /** Save the curated schema document. */
  const handleSaveSchema = useCallback(async (markdown: string) => {
    if (!selectedSource) return;
    setSchemaCuration((prev) => prev ? { ...prev, phase: 'saving' } : null);
    try {
      const res = await fetch(`/api/data-sources/${selectedSource}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaDoc: markdown }),
      });
      if (!res.ok) throw new Error('Save failed');
      // Update local state so callout doesn't reappear
      setDataSources((prev) =>
        prev.map((ds) =>
          ds.id === selectedSource ? { ...ds, hasSchemaDoc: true } : ds,
        ),
      );
      setSchemaCuration(null);
    } catch {
      setSchemaCuration((prev) => prev ? { ...prev, phase: 'editing' } : null);
    }
  }, [selectedSource]);

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

            case 'status':
              // Server-side status updates (e.g. schema bootstrap progress)
              if (data.text) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: data.text }
                      : m,
                  ),
                );
              }
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
                // HTML views have data embedded — no need to fetch
                if (data.viewSpec.html) {
                  setViewData(null);
                } else if (data.queryResult?.rows) {
                  setViewData(data.queryResult.rows);
                } else if (lastQueryRows) {
                  setViewData(lastQueryRows);
                } else {
                  // Legacy ViewSpec path: execute the query to get data
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

            case 'schema_proposed':
              // Agent proposed a schema doc — open it in the editor for user review
              if (data.document) {
                setSchemaCuration({ phase: 'editing', markdown: data.document });
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
            // HTML views have data embedded — no need to fetch
            if (result.viewSpec.html) {
              setViewData(null);
            } else if (result.queryResult?.rows) {
              setViewData(result.queryResult.rows);
            } else {
              // Legacy ViewSpec path: execute the query to get data
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

  /** Generate schema documentation by sending a chat message that triggers exploration. */
  const handleGenerateSchema = useCallback(() => {
    if (!selectedSource) return;
    schemaGenerationTriggered.current = true;
    setSchemaCuration(null); // Hide callout while chat runs
    const source = dataSources.find((s) => s.id === selectedSource);
    const sourceName = source?.name ?? 'this database';
    handleSend(
      `I need you to explore the "${sourceName}" database (source_id: ${selectedSource}) and create schema documentation.\n\n` +
      `Follow these steps IN ORDER:\n\n` +
      `**Phase 1 — Explore:** Use get_schema, describe_table, and run_sql to understand the tables, columns, relationships, and data patterns. ` +
      `Pay special attention to: foreign key columns (which ID columns link to which tables), ` +
      `enum/categorical values, date ranges, and row counts.\n\n` +
      `**Phase 2 — Ask Questions:** Before writing any documentation, you MUST ask me at least 3 questions about:\n` +
      `- Which tables are most important for the use cases I care about\n` +
      `- Any domain-specific terminology or gotchas I should know about\n` +
      `- How specific filtering should work (e.g. how to identify certain subsets of data)\n` +
      `Wait for my answers before proceeding.\n\n` +
      `**Phase 3 — Propose:** After I answer your questions, call propose_schema_doc with source_id="${selectedSource}" ` +
      `and the complete documentation as markdown. I will review and edit it before saving.\n\n` +
      `The documentation should cover: table descriptions, key columns, join patterns, data gotchas, and example queries. Keep it under 6000 characters.`,
    );
  }, [selectedSource, dataSources, handleSend]);

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

          {/* Right: View or Schema Curation */}
          <div className="flex-1 overflow-auto">
            {currentView && isHtmlView(currentView) ? (
              <HtmlViewRenderer
                view={currentView}
                isLoading={isStreaming}
              />
            ) : currentView ? (
              <ViewRenderer
                spec={currentView as ViewSpec}
                data={viewData}
                isLoading={isStreaming}
                error={null}
                width={800}
                height={600}
              />
            ) : schemaCuration ? (
              <SchemaCurationPanel
                sourceId={selectedSource ?? ''}
                sourceName={dataSources.find((s) => s.id === selectedSource)?.name ?? ''}
                phase={schemaCuration.phase}
                markdown={schemaCuration.markdown}
                onGenerate={handleGenerateSchema}
                onSave={handleSaveSchema}
                onCancel={() => setSchemaCuration({ phase: 'callout', markdown: '' })}
                onMarkdownChange={(md) => setSchemaCuration((prev) => prev ? { ...prev, markdown: md } : null)}
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

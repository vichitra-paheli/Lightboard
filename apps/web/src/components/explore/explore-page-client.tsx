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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Register chart panel plugins on module load so legacy ViewSpec paths
// continue to render charts for conversations that haven't migrated to the
// agent-generated HTML output yet.
if (!defaultPanelRegistry.has('bar-chart')) {
  defaultPanelRegistry.register(
    barChartPlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0],
  );
  defaultPanelRegistry.register(
    timeSeriesLinePlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0],
  );
  defaultPanelRegistry.register(
    statCardPlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0],
  );
  defaultPanelRegistry.register(
    dataTablePlugin as unknown as Parameters<typeof defaultPanelRegistry.register>[0],
  );
}

import type { HtmlView } from '@/components/view-renderer';
import { useUiStore } from '@/stores/ui-store';
import type { ChatMessageData, ToolCallData, AgentIndicatorData } from './chat-message';
import { Composer } from './composer';
import { FilmstripButton } from './filmstrip-button';
import { FilmstripPanel, type FilmstripItem } from './filmstrip-panel';
import type { DataSourceOption } from './types';
import { ExploreSidebar } from './sidebar/explore-sidebar';
import { Thread } from './thread';
import { parseSSE } from '@/lib/sse-parser';

/**
 * Client-side Explore page. Centered-thread model: sidebar slot hosts the DB
 * picker + conversations list + new-chat button, the main area is a stacked
 * Thread + Composer. Charts render inline in the thread inside each turn's
 * `InlineChartFrame`, not in a right panel.
 *
 * PR 6 replaces the legacy bottom-pinned `ViewFilmstrip` with a right
 * slide-out `FilmstripPanel`. The panel is a secondary navigation surface
 * on top of the inline-in-thread primary surface: click a card to scroll
 * the thread to that view's turn. Open-state is local (not persisted)
 * because a reopened Explore page should start fresh rather than restore
 * a potentially-stale filmstrip position.
 */
export function ExplorePageClient() {
  const t = useTranslations('explore');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [viewHistory, setViewHistory] = useState<HtmlView[]>([]);
  const [activeViewIndex, setActiveViewIndex] = useState(-1);
  // Ephemeral per-session flag — deliberately not persisted across reloads.
  // Restoring a stale panel-open state on a conversation that no longer has
  // any views is more jarring than starting closed every time.
  const [filmstripOpen, setFilmstripOpen] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [schemaCuration, setSchemaCuration] = useState<{
    phase: 'callout' | 'generating' | 'editing' | 'saving';
    markdown: string;
  } | null>(null);
  const schemaGenerationTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const setSidebarSlot = useUiStore((s) => s.setSidebarSlot);

  /**
   * Fetch data sources on mount. Kept as a one-shot `fetch` so the Explore
   * route renders without a react-query provider; migrating to react-query
   * is tracked alongside the other server-state work and doesn't belong in
   * this PR.
   */
  useEffect(() => {
    async function loadSources() {
      try {
        const res = await fetch('/api/data-sources');
        if (res.ok) {
          const data = await res.json();
          setDataSources(
            data.dataSources.map(
              (ds: {
                id: string;
                name: string;
                type: string;
                config?: Record<string, unknown>;
              }) => ({
                id: ds.id,
                name: ds.name,
                type: ds.type,
                hasSchemaDoc: !!ds.config?.schemaDoc,
              }),
            ),
          );
        }
      } catch {
        // Silently fail — dropdown will be empty
      }
    }
    loadSources();
  }, []);

  /**
   * Cmd+K focuses the DB picker's dropdown trigger (moved into the shell
   * sidebar in PR 4). The trigger carries a `data-db-picker-trigger`
   * attribute so this selector doesn't have to know the underlying
   * component class names.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const trigger = document.querySelector<HTMLButtonElement>(
          '[data-db-picker-trigger]',
        );
        trigger?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /**
   * Show the schema curation callout when a source without schemaDoc is
   * picked, and suppress the callout once we've already triggered a
   * generation run in this session. Also suppresses the callout while any
   * view is active so new charts don't get hidden behind the setup UI.
   */
  useEffect(() => {
    if (!selectedSource) {
      setSchemaCuration(null);
      schemaGenerationTriggered.current = false;
      return;
    }
    if (schemaGenerationTriggered.current) return;
    const source = dataSources.find((s) => s.id === selectedSource);
    // Suppress the callout if the most-recent assistant message already
    // produced a view — showing it would flash a setup CTA on top of the
    // user's results.
    const hasView = messages.some((m) => m.role === 'assistant' && m.view);
    if (source && !source.hasSchemaDoc && !hasView) {
      setSchemaCuration({ phase: 'callout', markdown: '' });
    } else {
      setSchemaCuration(null);
    }
  }, [selectedSource, dataSources, messages]);

  /** Save the curated schema document. */
  const handleSaveSchema = useCallback(
    async (markdown: string) => {
      if (!selectedSource) return;
      setSchemaCuration((prev) => (prev ? { ...prev, phase: 'saving' } : null));
      try {
        const res = await fetch(`/api/data-sources/${selectedSource}/schema`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schemaDoc: markdown }),
        });
        if (!res.ok) throw new Error('Save failed');
        setDataSources((prev) =>
          prev.map((ds) =>
            ds.id === selectedSource ? { ...ds, hasSchemaDoc: true } : ds,
          ),
        );
        setSchemaCuration(null);
      } catch {
        setSchemaCuration((prev) => (prev ? { ...prev, phase: 'editing' } : null));
      }
    },
    [selectedSource],
  );

  /**
   * Consumes an SSE stream and updates messages progressively.
   * Attaches any `view_created` output directly onto the assistant message
   * so `<Turn>` can render it inline in the thread.
   */
  const consumeSSEStream = useCallback(
    async (response: Response, assistantMsgId: string) => {
      // Track the last successful query result from run_sql or execute_query
      // — used as a data-rows fallback for legacy ViewSpec paths.
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
              if (data.text) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId ? { ...m, content: data.text } : m,
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
                    ? { ...m, toolCalls: [...(m.toolCalls ?? []), newToolCall] }
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
                                status: data.isError
                                  ? ('error' as const)
                                  : ('done' as const),
                                ...(data.result !== undefined
                                  ? { result: String(data.result) }
                                  : {}),
                                ...(data.durationMs !== undefined
                                  ? { durationMs: data.durationMs }
                                  : {}),
                              }
                            : tc,
                        ),
                      }
                    : m,
                ),
              );
              if (
                !data.isError &&
                (data.name === 'run_sql' || data.name === 'execute_query')
              ) {
                try {
                  const parsed = JSON.parse(data.result);
                  if (parsed.rows) {
                    lastQueryRows = parsed.rows;
                  }
                } catch {
                  /* ignore parse errors */
                }
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
                // Attach the view onto this turn's assistant message so
                // <Turn> renders it inline. `viewData` is only populated for
                // legacy ViewSpec paths; HtmlView embeds its own data.
                const viewSpec = data.viewSpec as ViewSpec | HtmlView;
                const isHtml = 'html' in viewSpec;
                const viewData = isHtml
                  ? null
                  : data.queryResult?.rows ?? lastQueryRows ?? null;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, view: viewSpec, viewData }
                      : m,
                  ),
                );

                if (isHtml) {
                  // Top-level view history is still maintained so PR 6 can
                  // swap the current bottom-strip filmstrip for the new
                  // right slide-out without having to rethread this state.
                  setViewHistory((prev) => [...prev, viewSpec as HtmlView]);
                  setActiveViewIndex(-1);
                } else if (!viewData) {
                  // Legacy ViewSpec path with no rows yet — kick off the
                  // query and splice the result onto the message when it
                  // comes back.
                  const query = (viewSpec as ViewSpec).query;
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
                          setMessages((prev) =>
                            prev.map((m) =>
                              m.id === assistantMsgId
                                ? { ...m, viewData: result.rows }
                                : m,
                            ),
                          );
                        }
                      })
                      .catch(() => {
                        // Query execution failed — the view block will keep
                        // showing its loading state until the stream closes.
                      });
                  }
                }
              }
              break;

            case 'schema_proposed':
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
            Accept: 'text/event-stream',
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
          throw new Error(
            errData.error ?? `Agent request failed: ${response.status}`,
          );
        }

        const contentType = response.headers.get('Content-Type') ?? '';

        if (contentType.includes('text/event-stream')) {
          await consumeSSEStream(response, assistantMsgId);
        } else {
          // Fallback JSON mode — some providers don't stream.
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
            const viewSpec = result.viewSpec as ViewSpec | HtmlView;
            const isHtml = 'html' in viewSpec;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      view: viewSpec,
                      viewData: isHtml
                        ? null
                        : (result.queryResult?.rows ?? null),
                    }
                  : m,
              ),
            );
            if (isHtml) {
              setViewHistory((prev) => [...prev, viewSpec as HtmlView]);
              setActiveViewIndex(-1);
            } else if (!result.queryResult?.rows) {
              const query = (viewSpec as ViewSpec).query;
              const srcId = query?.source;
              if (srcId) {
                fetch(`/api/data-sources/${srcId}/query`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ queryIR: query }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((qr) => {
                    if (qr?.rows) {
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMsgId
                            ? { ...m, viewData: qr.rows }
                            : m,
                        ),
                      );
                    }
                  })
                  .catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
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
    setSchemaCuration(null);
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
    setViewHistory([]);
    setActiveViewIndex(-1);
    setConversationId(null);
  }, [handleStop]);

  /**
   * Install the Explore sidebar into the shell on mount; clear it on
   * unmount so non-Explore routes don't inherit stale widgets. The
   * `dataSources` / `selectedSource` / `handleNewConversation` values are
   * captured via the closure — reinstall whenever they change so the
   * sidebar UI reflects the current state.
   */
  useEffect(() => {
    setSidebarSlot(
      <ExploreSidebar
        sources={dataSources}
        selectedId={selectedSource}
        onSelectSource={setSelectedSource}
        onNewChat={handleNewConversation}
      />,
    );
    return () => {
      setSidebarSlot(null);
    };
  }, [dataSources, selectedSource, handleNewConversation, setSidebarSlot]);

  // Active source metadata for the composer dek. Tables/rows are not yet
  // exposed on the data-source API; pass just the name for now.
  const activeSource = dataSources.find((s) => s.id === selectedSource) ?? null;

  /**
   * Map the linear `viewHistory` into filmstrip display items. Each entry
   * keeps the original `HtmlView` so the thumbnail generator can read the
   * embedded Chart.js `type` string; the id is derived from the assistant
   * message that produced the view (falling back to a positional id when
   * matching fails) so React keys stay stable across re-renders.
   */
  const filmstripItems = useMemo<FilmstripItem[]>(() => {
    return viewHistory.map((view, i) => {
      const owningMessage = messages.find(
        (m) => m.role === 'assistant' && m.view === view,
      );
      return {
        id: owningMessage?.id ?? `view-${i}`,
        view,
      };
    });
  }, [viewHistory, messages]);

  /**
   * Clicking a card in the filmstrip marks that view active and scrolls
   * the thread to the turn that originally produced it. We locate the
   * turn by matching on the assistant message's `view` reference —
   * `viewHistory[i]` is a direct reference to the same object stored on
   * the message, so `===` is sufficient and avoids a separate id lookup.
   */
  const handleFilmstripSelect = useCallback(
    (index: number) => {
      if (index < 0 || index >= viewHistory.length) return;
      setActiveViewIndex(index);
      const target = viewHistory[index];
      const owningMessage = messages.find(
        (m) => m.role === 'assistant' && m.view === target,
      );
      if (owningMessage?.id) {
        const node = document.querySelector<HTMLElement>(
          `[data-message-id="${owningMessage.id}"]`,
        );
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [viewHistory, messages],
  );

  return (
    <ChartThemeProvider mode="dark">
      <div className="flex h-full flex-col">
        <Thread
          messages={messages}
          selectedSource={selectedSource}
          dataSources={dataSources}
          schemaCuration={schemaCuration}
          onGenerateSchema={handleGenerateSchema}
          onSaveSchema={handleSaveSchema}
          onCancelSchema={() =>
            setSchemaCuration({ phase: 'callout', markdown: '' })
          }
          onSchemaMarkdownChange={(md) =>
            setSchemaCuration((prev) => (prev ? { ...prev, markdown: md } : null))
          }
        />

        {/*
         * Fixed-position button at the top-right of the viewport, just below
         * the 56px top bar. Lives OUTSIDE the thread so it tracks the viewport
         * rather than the 920px content column. Its z-index (3) sits below the
         * filmstrip panel (z-index 5) so the panel naturally covers it when
         * open — the button appears "tucked under" the expanding panel.
         */}
        <div
          className="pointer-events-none fixed"
          style={{ top: 68, right: 20, zIndex: 3 }}
        >
          <div className="pointer-events-auto">
            <FilmstripButton
              open={filmstripOpen}
              onToggle={() => setFilmstripOpen((v) => !v)}
              count={viewHistory.length}
            />
          </div>
        </div>

        <Composer
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          selectedSourceMeta={activeSource ? { name: activeSource.name } : null}
        />

        <FilmstripPanel
          open={filmstripOpen}
          onClose={() => setFilmstripOpen(false)}
          items={filmstripItems}
          // Default the active card to the newest view when no specific card
          // has been picked yet, mirroring the legacy filmstrip behaviour.
          activeIndex={
            activeViewIndex === -1 ? viewHistory.length - 1 : activeViewIndex
          }
          onSelect={handleFilmstripSelect}
        />
      </div>
    </ChartThemeProvider>
  );
}

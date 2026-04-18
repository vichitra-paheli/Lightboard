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
import type { ChatMessageData, MessagePart } from './chat-message';
import { Composer } from './composer';
import { createReducer, parseSSEJson, type Reducer } from './sse-reducer';
import type { DataSourceOption } from './types';
import { ExploreSidebar } from './sidebar/explore-sidebar';
import { Thread } from './thread';
import { ViewFilmstrip } from './view-filmstrip';
import { parseSSE } from '@/lib/sse-parser';

/**
 * Client-side Explore page. Centered-thread model: sidebar slot hosts the DB
 * picker + conversations list + new-chat button, the main area is a stacked
 * Thread + Composer. Charts render inline in the thread inside each turn's
 * `InlineChartFrame`, not in a right panel.
 *
 * Under PR 5, SSE events feed an ordered `parts[]` via the pure reducer in
 * `sse-reducer.ts`. The reducer preserves the temporal interleaving of
 * text / tool calls / charts / delegations so the trace renders in the
 * exact sequence the agent produced events.
 *
 * The legacy `ViewFilmstrip` is kept imported and rendered with `hidden`
 * so PR 6 can swap it for the right slide-out without a risky revert
 * leaving a dangling import. The filmstrip still receives fresh
 * `viewHistory` derived from the messages' view parts.
 */
export function ExplorePageClient() {
  const t = useTranslations('explore');
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [activeViewIndex, setActiveViewIndex] = useState(-1);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [schemaCuration, setSchemaCuration] = useState<{
    phase: 'callout' | 'generating' | 'editing' | 'saving';
    markdown: string;
  } | null>(null);
  const schemaGenerationTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // The active reducer instance for the in-flight assistant message. Held
  // in a ref so `handleStop` can call `.abort()` against the same stateful
  // context the stream is accumulating into.
  const activeReducerRef = useRef<Reducer | null>(null);
  const setSidebarSlot = useUiStore((s) => s.setSidebarSlot);

  /**
   * Derived view history — scans every assistant message's parts[] for
   * `{ kind: 'view' }` entries and filters down to HtmlView (the only
   * kind the bottom-strip filmstrip understands). The filmstrip stays
   * imported (hidden) through PR 6 so a PR revert doesn't break the build.
   */
  const viewHistory = useMemo<HtmlView[]>(() => {
    const out: HtmlView[] = [];
    for (const m of messages) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts) {
        if (p.kind === 'view' && 'html' in p.view) {
          out.push(p.view);
        }
      }
    }
    return out;
  }, [messages]);

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
    // Suppress the callout if any assistant message already produced a
    // view — the user's results shouldn't be obscured by a setup CTA.
    const hasView = messages.some(
      (m) => m.role === 'assistant' && m.parts.some((p) => p.kind === 'view'),
    );
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
   * Apply an SSE event (already parsed and typed) to the assistant
   * message's parts[] via the stateful reducer. Replaces the legacy
   * inline switch statement that mutated fields like `content` and
   * `toolCalls[]` directly.
   */
  const applyEvent = useCallback(
    (
      assistantMsgId: string,
      apply: (prev: MessagePart[]) => MessagePart[],
    ) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, parts: apply(m.parts) } : m,
        ),
      );
    },
    [],
  );

  /**
   * Consume an SSE stream from the agent and feed events through the
   * ordered-parts reducer. Kicks off legacy ViewSpec queries if a view
   * lands without prefetched rows — those stay out of the reducer since
   * they're an out-of-band data fetch, not a stream event.
   */
  const consumeSSEStream = useCallback(
    async (response: Response, assistantMsgId: string, reducer: Reducer) => {
      for await (const sseEvent of parseSSE(response)) {
        // Schema curation is its own UI flow, not a chat part — handle it
        // before falling into the reducer.
        if (sseEvent.event === 'schema_proposed') {
          try {
            const data = JSON.parse(sseEvent.data);
            if (data.document) {
              setSchemaCuration({
                phase: 'editing',
                markdown: data.document,
              });
            }
          } catch {
            /* ignore */
          }
          continue;
        }

        if (sseEvent.event === 'error') {
          try {
            const data = JSON.parse(sseEvent.data);
            applyEvent(assistantMsgId, (prev) =>
              reducer.apply({ type: 'text', text: `\n\nError: ${data.error}` }, prev),
            );
            setMessages((m) =>
              m.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, isStreaming: false }
                  : msg,
              ),
            );
          } catch {
            /* ignore */
          }
          continue;
        }

        if (sseEvent.event === 'done') {
          try {
            const data = JSON.parse(sseEvent.data);
            if (data.conversationId) {
              setConversationId(data.conversationId);
            }
          } catch {
            /* ignore */
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
          setIsStreaming(false);
          continue;
        }

        const parsed = parseSSEJson(sseEvent.event, sseEvent.data);
        if (!parsed) continue;

        // For legacy ViewSpec (no html field), kick off the rows query
        // after the reducer has pushed the view part. The reducer will
        // attach `data: lastQueryRows ?? null` — if null, fire the fetch
        // and splice the rows into the view part when they arrive.
        if (parsed.type === 'view_created') {
          applyEvent(assistantMsgId, (prev) => reducer.apply(parsed, prev));
          const viewSpec = parsed.viewSpec;
          const isHtml = 'html' in viewSpec;
          if (!isHtml) {
            const query = (viewSpec as ViewSpec).query;
            const sourceId = query?.source;
            // If the event already carried rows, the reducer attached them —
            // nothing to do. Otherwise, fire a one-shot query.
            if (sourceId && !parsed.queryResult?.rows) {
              fetch(`/api/data-sources/${sourceId}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryIR: query }),
              })
                .then((r) => (r.ok ? r.json() : null))
                .then((result) => {
                  if (result?.rows) {
                    // Patch the latest view part's data. We can't re-run
                    // the reducer for this since it's an out-of-band
                    // delivery — splice directly.
                    setMessages((prev) =>
                      prev.map((m) => {
                        if (m.id !== assistantMsgId) return m;
                        const idx = [...m.parts]
                          .reverse()
                          .findIndex((p) => p.kind === 'view');
                        if (idx === -1) return m;
                        const actualIdx = m.parts.length - 1 - idx;
                        const existing = m.parts[actualIdx]!;
                        if (existing.kind !== 'view') return m;
                        const updated: MessagePart = {
                          ...existing,
                          data: result.rows,
                        };
                        return {
                          ...m,
                          parts: [
                            ...m.parts.slice(0, actualIdx),
                            updated,
                            ...m.parts.slice(actualIdx + 1),
                          ],
                        };
                      }),
                    );
                  }
                })
                .catch(() => {
                  // Query failed — the view card will stay in its empty state.
                });
            }
          }
          // HtmlView path: also maintain the hidden filmstrip's active
          // index. A brand-new view lands at the end of viewHistory, so
          // reset the cursor to default (derived end-of-list) behavior.
          if (isHtml) {
            setActiveViewIndex(-1);
          }
          continue;
        }

        applyEvent(assistantMsgId, (prev) => reducer.apply(parsed, prev));
      }

      // Safety net: if the stream ended without an explicit `done` event,
      // clear the streaming flag so the cursor stops blinking.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
        ),
      );
    },
    [applyEvent],
  );

  const handleSend = useCallback(
    async (message: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const userMsg: ChatMessageData = {
        id: `msg_${Date.now()}`,
        role: 'user',
        parts: [{ kind: 'text', text: message }],
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const assistantMsgId = `msg_${Date.now()}_reply`;

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: 'assistant',
          parts: [],
          isStreaming: true,
        },
      ]);

      const reducer = createReducer();
      activeReducerRef.current = reducer;

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
          await consumeSSEStream(response, assistantMsgId, reducer);
        } else {
          // Fallback JSON mode — some providers don't stream. Push a
          // synthetic series of events through the reducer so the final
          // parts[] matches what a streaming response would have produced.
          const result = await response.json();

          if (typeof result.text === 'string' && result.text.length > 0) {
            applyEvent(assistantMsgId, (prev) =>
              reducer.apply({ type: 'text', text: result.text }, prev),
            );
          }

          if (Array.isArray(result.toolCalls)) {
            for (const tc of result.toolCalls as Array<{
              name: string;
              status?: string;
              result?: string;
              durationMs?: number;
            }>) {
              applyEvent(assistantMsgId, (prev) =>
                reducer.apply({ type: 'tool_start', name: tc.name }, prev),
              );
              applyEvent(assistantMsgId, (prev) =>
                reducer.apply(
                  {
                    type: 'tool_end',
                    name: tc.name,
                    ...(tc.result !== undefined ? { result: tc.result } : {}),
                    ...(tc.durationMs !== undefined
                      ? { durationMs: tc.durationMs }
                      : {}),
                    isError: tc.status === 'error',
                  },
                  prev,
                ),
              );
            }
          }

          if (result.viewSpec) {
            applyEvent(assistantMsgId, (prev) =>
              reducer.apply(
                {
                  type: 'view_created',
                  viewSpec: result.viewSpec,
                  ...(result.queryResult
                    ? { queryResult: result.queryResult }
                    : {}),
                },
                prev,
              ),
            );
            const isHtml = 'html' in result.viewSpec;
            if (isHtml) {
              setActiveViewIndex(-1);
            } else if (!result.queryResult?.rows) {
              const query = (result.viewSpec as ViewSpec).query;
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
                        prev.map((m) => {
                          if (m.id !== assistantMsgId) return m;
                          const idx = [...m.parts]
                            .reverse()
                            .findIndex((p) => p.kind === 'view');
                          if (idx === -1) return m;
                          const actualIdx = m.parts.length - 1 - idx;
                          const existing = m.parts[actualIdx]!;
                          if (existing.kind !== 'view') return m;
                          const updated: MessagePart = {
                            ...existing,
                            data: qr.rows,
                          };
                          return {
                            ...m,
                            parts: [
                              ...m.parts.slice(0, actualIdx),
                              updated,
                              ...m.parts.slice(actualIdx + 1),
                            ],
                          };
                        }),
                      );
                    }
                  })
                  .catch(() => {});
              }
            }
          }

          if (result.conversationId) {
            setConversationId(result.conversationId);
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
        } else {
          const errMsg = err instanceof Error ? err.message : t('noResponse');
          applyEvent(assistantMsgId, (prev) =>
            reducer.apply({ type: 'text', text: errMsg }, prev),
          );
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
        activeReducerRef.current = null;
      }
    },
    [selectedSource, conversationId, t, consumeSSEStream, applyEvent],
  );

  /**
   * Stop the current agent stream. Flips any running tool_call /
   * agent_delegation parts to `aborted` via the reducer's abort() so the
   * UI doesn't leave a spinning dot stuck on the page.
   */
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    const reducer = activeReducerRef.current;
    setMessages((prev) =>
      prev.map((m) => {
        if (!m.isStreaming) return m;
        const nextParts = reducer ? reducer.abort(m.parts) : m.parts;
        return { ...m, parts: nextParts, isStreaming: false };
      }),
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

        <Composer
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          selectedSourceMeta={activeSource ? { name: activeSource.name } : null}
        />

        {/* Legacy bottom-strip filmstrip kept mounted (hidden) so PR 6 can
           swap it for the right slide-out without risking a PR 4 revert
           leaving a dangling import. The component still receives fresh
           `viewHistory` derived from the messages' view parts. */}
        <div hidden data-legacy-filmstrip>
          <ViewFilmstrip
            views={viewHistory}
            activeIndex={
              activeViewIndex === -1 ? viewHistory.length - 1 : activeViewIndex
            }
            onSelect={(i) => {
              setActiveViewIndex(i);
            }}
          />
        </div>
      </div>
    </ChartThemeProvider>
  );
}

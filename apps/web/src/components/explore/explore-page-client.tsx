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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { queryKeys } from '@/lib/query-keys';

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
import { FilmstripButton } from './filmstrip-button';
import { FilmstripPanel, type FilmstripItem } from './filmstrip-panel';
import { createReducer, parseSSEJson, type Reducer } from './sse-reducer';
import { buildSuggestionsForView } from './suggestions-fixture';
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
 * Under PR 5, SSE events feed an ordered `parts[]` via the pure reducer in
 * `sse-reducer.ts`. The reducer preserves the temporal interleaving of
 * text / tool calls / charts / delegations so the trace renders in the
 * exact sequence the agent produced events.
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
  // Transient flag covering the gap between a send click and the first
  // server-sent event arriving. Clears once fetch() resolves response
  // headers so the loader inside the send button maps to a real
  // "waiting on the server" window rather than the full streaming turn.
  const [isSending, setIsSending] = useState(false);
  // Transient flag covering the gap between an abort click and the fetch
  // promise settling. The abort round-trip is usually <100ms so this is a
  // brief flash — its job is to confirm the click was registered.
  const [isAborting, setIsAborting] = useState(false);
  // When the user clicks a suggestion chip, the matching chip renders a
  // loader in place of its text until the open-connection gap clears.
  // Shares its lifecycle with `isSending` — set when the click fires,
  // cleared when fetch() resolves or the turn errors out.
  const [activeSuggestion, setActiveSuggestion] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [activeViewIndex, setActiveViewIndex] = useState(-1);
  // Ephemeral per-session flag — deliberately not persisted across reloads.
  // Restoring a stale panel-open state on a conversation that no longer has
  // any views is more jarring than starting closed every time.
  const [filmstripOpen, setFilmstripOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [schemaCuration, setSchemaCuration] = useState<{
    phase: 'callout' | 'generating' | 'editing' | 'saving';
    markdown: string;
  } | null>(null);
  const schemaGenerationTriggered = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  /**
   * Load the org's data sources and project them into the `DataSourceOption`
   * shape the picker + composer dek consume. Shares the `['data-sources']`
   * key with the Settings surface so switching between pages doesn't refire
   * the fetch within the 5 min staleTime window.
   */
  const dataSourcesQuery = useQuery({
    queryKey: queryKeys.dataSources(),
    queryFn: async () => {
      const res = await fetch('/api/data-sources');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        dataSources?: {
          id: string;
          name: string;
          type: string;
          config?: Record<string, unknown>;
        }[];
      };
      // Normalize to a flat array — shared cache key with `useDataSources`,
      // whose queryFn also returns the unwrapped shape. Divergent shapes
      // under the same key cause `.map is not a function` when one page's
      // cache is read by the other.
      return body.dataSources ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const dataSources: DataSourceOption[] = useMemo(() => {
    return (
      dataSourcesQuery.data?.map((ds) => ({
        id: ds.id,
        name: ds.name,
        type: ds.type,
        hasSchemaDoc: !!ds.config?.schemaDoc,
      })) ?? []
    );
  }, [dataSourcesQuery.data]);
  // The active reducer instance for the in-flight assistant message. Held
  // in a ref so `handleStop` can call `.abort()` against the same stateful
  // context the stream is accumulating into.
  const activeReducerRef = useRef<Reducer | null>(null);
  const setSidebarSlot = useUiStore((s) => s.setSidebarSlot);

  /**
   * Derived view history — scans every assistant message's parts[] for
   * `{ kind: 'view' }` entries and filters down to HtmlView (the only
   * kind the slide-out FilmstripPanel understands). Recomputed from
   * `messages` so reopening a conversation rebuilds the strip automatically
   * from the same source of truth the thread renders from.
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
   * TODO(backend-suggestions): Replace this with an SSE `suggestions` event
   * so the agent can supply dimension/measure-aware follow-ups. For PR 7 we
   * backfill the suggestions part from a hardcoded fixture keyed off the
   * first view's chart kind so the UI surface ships without a backend
   * dependency. See `suggestions-fixture.ts` for the deletion trigger.
   *
   * Trigger conditions:
   *   1. The message is a completed assistant turn (not `isStreaming`).
   *   2. It carries at least one `{ kind: 'view' }` part — chips are a
   *      visual follow-up for chart turns, not for tool-only or pure-text
   *      replies.
   *   3. It does not already have a `{ kind: 'suggestions' }` part — keeps
   *      the effect idempotent across re-renders and avoids appending
   *      duplicates when other parts of `messages` change.
   */
  useEffect(() => {
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.role !== 'assistant' || m.isStreaming) return m;
        const viewPart = m.parts.find((p) => p.kind === 'view');
        if (!viewPart || viewPart.kind !== 'view') return m;
        const hasSuggestions = m.parts.some((p) => p.kind === 'suggestions');
        if (hasSuggestions) return m;
        const items = buildSuggestionsForView(viewPart.view);
        if (items.length === 0) return m;
        changed = true;
        return {
          ...m,
          parts: [...m.parts, { kind: 'suggestions' as const, items }],
        };
      });
      return changed ? next : prev;
    });
  }, [messages]);

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

  /**
   * Persist the curated schema document for `selectedSource`. Optimistically
   * patches the shared `['data-sources']` cache to flip `hasSchemaDoc` so
   * the picker's doc chip updates before the fetch resolves; rolls back on
   * failure.
   */
  const saveSchemaMutation = useMutation<
    void,
    Error,
    { sourceId: string; markdown: string },
    { previous?: { dataSources: unknown[] } }
  >({
    mutationFn: async ({ sourceId, markdown }) => {
      const res = await fetch(`/api/data-sources/${sourceId}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaDoc: markdown }),
      });
      if (!res.ok) throw new Error('Save failed');
    },
    onMutate: async ({ sourceId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.dataSources() });
      const previous = queryClient.getQueryData<{
        dataSources: { id: string; config?: Record<string, unknown> }[];
      }>(queryKeys.dataSources());
      if (previous) {
        queryClient.setQueryData(queryKeys.dataSources(), {
          ...previous,
          dataSources: previous.dataSources.map((ds) =>
            ds.id === sourceId
              ? {
                  ...ds,
                  config: { ...(ds.config ?? {}), schemaDoc: true },
                }
              : ds,
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.dataSources(), context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataSources() });
    },
  });

  const handleSaveSchema = useCallback(
    async (markdown: string) => {
      if (!selectedSource) return;
      setSchemaCuration((prev) => (prev ? { ...prev, phase: 'saving' } : null));
      try {
        await saveSchemaMutation.mutateAsync({ sourceId: selectedSource, markdown });
        setSchemaCuration(null);
      } catch {
        setSchemaCuration((prev) => (prev ? { ...prev, phase: 'editing' } : null));
      }
    },
    [selectedSource, saveSchemaMutation],
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
      setIsSending(true);

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

        // Server responded — the open-connection gap is over. Clear the
        // send-button / suggestion-chip loader before any event processing
        // so the user sees the streaming content take over.
        setIsSending(false);
        setActiveSuggestion(null);

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
        setIsSending(false);
        setIsAborting(false);
        setActiveSuggestion(null);
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
    setIsAborting(true);
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
    // The fetch promise rejection + handleSend's finally clears isAborting
    // on the next microtask. This set above is the immediate visual cue
    // for the user that the click landed.
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

  /**
   * Map the linear `viewHistory` into filmstrip display items. Each entry
   * keeps the original `HtmlView` so the thumbnail generator can read the
   * embedded Chart.js `type` string; the id is derived from the assistant
   * message that produced the view (falling back to a positional id when
   * matching fails) so React keys stay stable across re-renders.
   *
   * Under PR 5's parts[] model, views live inside each assistant message's
   * parts array as `{ kind: 'view', view }` entries. `viewHistory[i]` is a
   * direct reference to the same object stored on the part, so `===` is
   * sufficient to locate the owning message without a separate id lookup.
   */
  const filmstripItems = useMemo<FilmstripItem[]>(() => {
    return viewHistory.map((view, i) => {
      const owningMessage = messages.find(
        (m) =>
          m.role === 'assistant' &&
          m.parts.some((p) => p.kind === 'view' && p.view === view),
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
   * turn by scanning assistant messages' parts[] for a `view` part whose
   * `.view` references the same object as `viewHistory[index]`.
   */
  const handleFilmstripSelect = useCallback(
    (index: number) => {
      if (index < 0 || index >= viewHistory.length) return;
      setActiveViewIndex(index);
      const target = viewHistory[index];
      const owningMessage = messages.find(
        (m) =>
          m.role === 'assistant' &&
          m.parts.some((p) => p.kind === 'view' && p.view === target),
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
          onSuggestionClick={(text) => {
            setActiveSuggestion(text);
            handleSend(text);
          }}
          activeSuggestion={activeSuggestion}
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
          isSending={isSending}
          isAborting={isAborting}
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

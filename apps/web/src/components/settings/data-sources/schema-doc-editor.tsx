'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { LightboardLoader } from '@/components/brand';
import { queryKeys } from '@/lib/query-keys';

import { GhostButton, PrimaryButton, SecondaryButton } from '../primitives';
import type { DataSourceRow } from './use-data-sources';

/** Props for {@link SchemaDocEditor}. */
export interface SchemaDocEditorProps {
  /** The data source row whose schema doc we're editing. */
  source: DataSourceRow;
}

/** Shape of `POST /api/data-sources/[id]/schema/generate`. */
interface GenerateResponse {
  rawMarkdown: string;
  annotatedMarkdown: string;
}

/**
 * Markdown editor for a data source's curated `schemaDoc`.
 *
 * Shows the current persisted doc (from `source.config.schemaDoc`) in a plain
 * textarea. Provides:
 *   - "Generate with AI" — POSTs to `/schema/generate` and replaces the
 *     textarea with the H3-sectioned briefing the annotator returns. If a
 *     doc already exists, the user must confirm the overwrite.
 *   - "Save" — PUTs to `/schema` and invalidates the data-sources cache.
 *   - "Reset" — reloads the textarea from the currently-saved doc,
 *     discarding unsaved changes.
 *
 * The editor is intentionally dumb (no rich editing, no preview pane). The
 * output is consumed verbatim by the agent's system prompt — what the human
 * sees here is exactly what the LLM will read.
 */
export function SchemaDocEditor({ source }: SchemaDocEditorProps) {
  const t = useTranslations('settings.dataSources.schemaEditor');
  const queryClient = useQueryClient();

  const savedDoc = (source.config?.schemaDoc as string | undefined) ?? '';
  const [draft, setDraft] = useState(savedDoc);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Keep the draft in sync when the caller swaps the source (e.g. after a
  // route change) and when react-query refetches a fresher row.
  useEffect(() => {
    setDraft(savedDoc);
  }, [savedDoc, source.id]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/data-sources/${source.id}/schema/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as GenerateResponse;
    },
    onSuccess: (data) => {
      setDraft(data.annotatedMarkdown);
      setErrorMsg(null);
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (schemaDoc: string) => {
      const res = await fetch(`/api/data-sources/${source.id}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaDoc }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setErrorMsg(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.dataSources() });
    },
    onError: (err) => {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    },
  });

  const generating = generateMutation.isPending;
  const saving = saveMutation.isPending;
  const dirty = draft !== savedDoc;

  function handleGenerate() {
    // Guard an explicit overwrite so a user doesn't lose hand-edits by
    // clicking AI Generate on a populated doc.
    if (savedDoc && !window.confirm(t('confirmRegenerate'))) return;
    generateMutation.mutate();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-6 border-b border-[var(--line-1)] pb-3">
        <div className="min-w-0">
          <h2
            className="mb-1 text-[15px] font-medium text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t('title')}
          </h2>
          <p
            className="text-[12.5px] leading-[1.55] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('description')}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <SecondaryButton onClick={handleGenerate} disabled={generating || saving}>
            {generating && <LightboardLoader size={12} ariaLabel="" />}
            <SparkleIcon />
            <span>{generating ? t('generating') : savedDoc ? t('regenerate') : t('generate')}</span>
          </SecondaryButton>
          <GhostButton
            onClick={() => setDraft(savedDoc)}
            disabled={!dirty || generating || saving}
          >
            {t('reset')}
          </GhostButton>
          <PrimaryButton
            onClick={() => saveMutation.mutate(draft)}
            disabled={!dirty || generating || saving}
          >
            {saving && <LightboardLoader size={12} ariaLabel="" />}
            <span>{saving ? t('saving') : t('save')}</span>
          </PrimaryButton>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-[8px] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3.5 py-2.5 text-[12.5px] text-[var(--danger-ink)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {errorMsg}
        </div>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder={t('placeholder')}
        className="min-h-[520px] w-full resize-y rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)] p-4 text-[13px] text-[var(--ink-1)] outline-none focus:border-[var(--accent-border)] focus:shadow-[var(--glow-accent-soft)]"
        style={{
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.6,
          tabSize: 2,
        }}
      />

      <div
        className="flex items-center justify-between text-[11px] uppercase tracking-[0.1em] text-[var(--ink-4)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        <span>{t('charCount', { count: draft.length })}</span>
        <span>{dirty ? t('unsavedChanges') : t('saved')}</span>
      </div>
    </div>
  );
}

/** Small sparkle glyph matching SchemaDocEmpty. */
function SparkleIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M6 1.5l0.9 2.6L9.5 5l-2.6 0.9L6 8.5 5.1 5.9 2.5 5l2.6-0.9L6 1.5zM9.5 7.5l0.4 1.1 1.1 0.4-1.1 0.4-0.4 1.1-0.4-1.1L8 9l1.1-0.4 0.4-1.1z"
        fill="currentColor"
      />
    </svg>
  );
}

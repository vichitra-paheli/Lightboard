'use client';

import { useTranslations } from 'next-intl';

/** Props for the SchemaCurationPanel component. */
interface SchemaCurationPanelProps {
  sourceId: string;
  sourceName: string;
  phase: 'callout' | 'generating' | 'editing' | 'saving';
  markdown: string;
  onGenerate: () => void;
  onSave: (markdown: string) => void;
  onCancel: () => void;
  onMarkdownChange: (markdown: string) => void;
}

/**
 * Schema curation panel — shown in the viz area when a data source lacks schema documentation.
 * Handles four phases: callout prompt, generation spinner, markdown editor, and save.
 */
export function SchemaCurationPanel({
  sourceName,
  phase,
  markdown,
  onGenerate,
  onSave,
  onCancel,
  onMarkdownChange,
}: SchemaCurationPanelProps) {
  const t = useTranslations('explore');

  if (phase === 'callout') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: 'var(--color-accent)', opacity: 0.15 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent-foreground)' }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3
            className="text-lg font-semibold"
            style={{ color: 'var(--color-foreground)' }}
          >
            {t('schemaSetupTitle')}
          </h3>
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {t('schemaSetupDescription', { sourceName })}
          </p>
          <button
            onClick={onGenerate}
            className="mt-6 rounded-md px-6 py-2 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            {t('schemaGenerate')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--color-muted-foreground)', borderTopColor: 'transparent' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-foreground)' }}>
            {t('schemaGenerating')}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {t('schemaGeneratingHint')}
          </p>
        </div>
      </div>
    );
  }

  // phase === 'editing' or 'saving'
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-foreground)' }}>
            {t('schemaEditorTitle', { sourceName })}
          </h3>
          <p className="text-xs" style={{ color: 'var(--color-muted-foreground)' }}>
            {t('schemaEditorHint')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            {t('cancel')}
          </button>
          <button
            onClick={() => onSave(markdown)}
            disabled={phase === 'saving'}
            className="rounded-md px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-primary-foreground)',
            }}
          >
            {phase === 'saving' ? t('schemaSaving') : t('schemaSave')}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <textarea
          value={markdown}
          onChange={(e) => onMarkdownChange(e.target.value)}
          className="h-full w-full resize-none border-0 p-4 text-sm focus:outline-none"
          style={{
            backgroundColor: 'var(--color-background)',
            color: 'var(--color-foreground)',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            lineHeight: '1.6',
          }}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

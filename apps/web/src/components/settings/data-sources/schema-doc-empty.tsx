'use client';

import { useTranslations } from 'next-intl';

import { PrimaryButton, SecondaryButton } from '../primitives';

/** Props for {@link SchemaDocEmpty}. */
export interface SchemaDocEmptyProps {
  /** Datasource name rendered inline for context. */
  sourceName: string;
  /** Number of tables detected during the last introspection. */
  tableCount: number;
}

/**
 * Empty-state shown when a datasource has no Schema Doc yet. The "Start
 * with AI" CTA is intentionally disabled in this release — the guided
 * authoring tool ships in a follow-up PR. Surrounding copy matches the
 * handoff `SchemaDocEmpty` component.
 */
export function SchemaDocEmpty({ sourceName, tableCount }: SchemaDocEmptyProps) {
  const t = useTranslations('settings.dataSources.schemaEmpty');
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[var(--line-1)] bg-[var(--bg-2)] px-10 py-12 text-center">
      {/* Faint dot grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--line-1) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="relative">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[12px] border border-[var(--accent-border)]"
          style={{
            background: 'linear-gradient(135deg, var(--accent-bg), var(--bg-2))',
            boxShadow: 'var(--glow-accent-wide)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path
              d="M4 4h14v5H4zM4 11h14v7H4zM7 14.5h5M7 16.5h8"
              stroke="var(--accent-warm)"
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <h2
          className="mb-2 text-[20px] font-medium text-[var(--ink-1)]"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
        >
          {t('title')}
        </h2>
        <p
          className="mx-auto mb-5 max-w-[480px] text-[13.5px] leading-[1.6] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {t.rich('body', {
            source: () => (
              <span
                className="text-[var(--ink-1)]"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
              >
                {sourceName}
              </span>
            ),
          })}
        </p>
        <div className="inline-flex gap-2.5">
          <PrimaryButton disabled title={t('startWithAiDisabled')}>
            <SparkleIcon />
            <span>{t('startWithAi')}</span>
          </PrimaryButton>
          <SecondaryButton disabled>{t('importDbt')}</SecondaryButton>
          <SecondaryButton disabled>{t('startBlank')}</SecondaryButton>
        </div>
        <div
          className="mt-6 flex justify-center gap-7 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <div>{t('tablesDetected', { count: tableCount })}</div>
          <div className="text-[var(--ink-4)]">·</div>
          <div>{t('guidedDuration')}</div>
        </div>
      </div>
    </div>
  );
}

/** Small sparkle glyph reused from the handoff. */
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

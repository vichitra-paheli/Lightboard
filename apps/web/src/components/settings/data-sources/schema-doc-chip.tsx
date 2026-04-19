import { useTranslations } from 'next-intl';

/** Schema-doc status — derived from whether config.schemaDoc is populated. */
export type SchemaDocStatus = 'ready' | 'partial' | 'empty';

/** Props for {@link SchemaDocChip}. */
export interface SchemaDocChipProps {
  status: SchemaDocStatus;
  /** Documented percentage (0–100) — drives the ring-fill. */
  coverage: number;
}

const STATUS_META: Record<SchemaDocStatus, { color: string; labelKey: string }> = {
  ready: { color: '#7DB469', labelKey: 'ready' },
  partial: { color: '#E89B52', labelKey: 'partial' },
  empty: { color: '#55555C', labelKey: 'empty' },
};

/**
 * Coverage ring + label used in the datasource list and detail summary.
 * Mirrors the handoff `SchemaDocChip` — SVG ring with the remaining arc
 * tinted by status.
 */
export function SchemaDocChip({ status, coverage }: SchemaDocChipProps) {
  const t = useTranslations('settings.dataSources.schemaDoc');
  const meta = STATUS_META[status];
  const clamped = Math.max(0, Math.min(100, coverage));
  const dashArray = (clamped / 100) * 50.27; // 2πr with r=8
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-[22px] w-[22px]">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle cx="11" cy="11" r="8" fill="none" stroke="var(--line-1)" strokeWidth="2" />
          <circle
            cx="11"
            cy="11"
            r="8"
            fill="none"
            stroke={meta.color}
            strokeWidth="2"
            strokeDasharray={`${dashArray} 50.27`}
            strokeLinecap="round"
            transform="rotate(-90 11 11)"
          />
        </svg>
      </div>
      <div className="min-w-0">
        <div
          className="text-[12px] text-[var(--ink-1)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {t(meta.labelKey)}
        </div>
        <div
          className="mt-0 text-[9.5px] tracking-[0.04em] text-[var(--ink-5)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('coverage', { percent: clamped })}
        </div>
      </div>
    </div>
  );
}

/** Derive the chip status from the data-source's config blob. */
export function deriveSchemaDocStatus(
  config: Record<string, unknown> | null,
): { status: SchemaDocStatus; coverage: number } {
  if (!config) return { status: 'empty', coverage: 0 };
  const doc = typeof config.schemaDoc === 'string' ? config.schemaDoc : null;
  const ctx = config.schemaContext as { tables?: unknown[] } | undefined;
  if (doc && doc.length > 0) return { status: 'ready', coverage: 100 };
  if (ctx && Array.isArray(ctx.tables) && ctx.tables.length > 0) {
    return { status: 'partial', coverage: 50 };
  }
  return { status: 'empty', coverage: 0 };
}

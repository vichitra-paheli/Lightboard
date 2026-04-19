'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import { getProvider } from './provider-catalog';
import { ProviderGlyph } from './provider-glyph';
import type { LlmConfig, RoutingMap } from './use-llm-data';

/** Props for {@link LlmCard}. */
export interface LlmCardProps {
  config: LlmConfig;
  /** Current routing map — used to compute the "Routes" chip list. */
  routing: RoutingMap;
  /** Called when the user clicks the card to edit. */
  onEdit: (id: string) => void;
}

/** Roles this config is mapped to. */
function routedRoles(configId: string, routing: RoutingMap): (keyof RoutingMap)[] {
  return (Object.keys(routing) as (keyof RoutingMap)[]).filter((r) => routing[r] === configId);
}

/**
 * Single row in the "Configured models" list. Clicking anywhere opens the
 * edit drawer — mirrors the handoff LLMCard exactly.
 */
export function LlmCard({ config, routing, onEdit }: LlmCardProps) {
  const t = useTranslations('settings.llms');
  const tRoles = useTranslations('settings.llms.routing.roles');
  const provider = getProvider(config.provider);
  const roles = routedRoles(config.id, routing);
  const isDefault = routing.leader === config.id;

  return (
    <button
      type="button"
      onClick={() => onEdit(config.id)}
      className={cn(
        'group w-full grid grid-cols-[40px_1fr_220px_120px_auto] items-center gap-4',
        'rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)] px-5 py-4 text-left',
        'hover:border-[var(--line-3)] hover:bg-[var(--bg-3)]',
        'transition-colors duration-150 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
      )}
    >
      <ProviderGlyph provider={config.provider} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-[14.5px] font-medium text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {config.name}
          </span>
          {isDefault && (
            <span
              className="rounded border border-[var(--accent-border)] bg-[var(--accent-bg)] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--accent-warm)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {t('configs.default')}
            </span>
          )}
          {!provider?.implemented && (
            <span
              className="rounded border border-[var(--line-3)] bg-[var(--bg-4)] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-mono)' }}
              title={t('configs.placeholderHint')}
            >
              {t('configs.placeholder')}
            </span>
          )}
        </div>
        <div
          className="mt-1 truncate text-[11px] text-[var(--ink-5)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {provider?.label ?? config.provider} · {config.model}
        </div>
      </div>
      <div>
        <div
          className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {t('configs.routes')}
        </div>
        {roles.length === 0 ? (
          <span
            className="text-[11px] text-[var(--ink-5)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('configs.noRoutes')}
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <span
                key={role}
                className="rounded border border-[var(--line-1)] bg-[var(--bg-4)] px-1.5 py-0.5 text-[10.5px] text-[var(--ink-2)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {tRoles(`${role}.label`)}
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--kind-narrate)]"
            style={{ boxShadow: '0 0 0 2px rgba(125,180,105,0.18)' }}
          />
          <span
            className="text-[12px] text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('configs.active')}
          </span>
        </div>
      </div>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className="text-[var(--ink-6)] group-hover:text-[var(--ink-2)] transition-colors"
        aria-hidden="true"
      >
        <path
          d="M3.5 1.5L7 5l-3.5 3.5"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Select, type SelectOption } from '../primitives';
import { getProvider } from './provider-catalog';
import type { LlmConfig, RoutingMap } from './use-llm-data';

/** Four roles in the order the handoff specifies. */
const ROLES: readonly (keyof RoutingMap)[] = ['leader', 'query', 'view', 'insights'] as const;

/** Props for {@link RoutingCard}. */
export interface RoutingCardProps {
  /** Current routing state fetched from the API. */
  routing: RoutingMap;
  /** Available configs — the Select is populated from this. */
  configs: LlmConfig[];
  /** Called after a role → config assignment persists; parents refetch. */
  onUpdated: () => void;
}

/**
 * Maps each agent role to a config row via a pair of dot-prefix selects.
 * PUTs each change independently so a slow request on one row doesn't
 * block the others.
 */
export function RoutingCard({ routing, configs, onUpdated }: RoutingCardProps) {
  const t = useTranslations('settings.llms.routing');
  const [savingRole, setSavingRole] = useState<keyof RoutingMap | null>(null);

  const options: SelectOption[] = configs.map((c) => {
    const provider = getProvider(c.provider);
    return {
      value: c.id,
      label: c.name,
      dot: provider?.dot,
      sub: provider?.glyph,
    };
  });

  async function assignRole(role: keyof RoutingMap, configId: string) {
    if (configId === routing[role]) return;
    setSavingRole(role);
    try {
      const res = await fetch('/api/settings/ai/routing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [role]: configId }),
      });
      if (res.ok) onUpdated();
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)]">
      <div className="flex items-center justify-between border-b border-[var(--line-1)] px-5 py-3.5">
        <div>
          <div
            className="text-[14px] font-medium text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {t('title')}
          </div>
          <div
            className="mt-1 text-[12px] text-[var(--ink-3)]"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('subtitle')}
          </div>
        </div>
      </div>
      {ROLES.map((role, i) => (
        <div
          key={role}
          className="grid grid-cols-[1fr_240px] items-center gap-4 px-5 py-3.5"
          style={{ borderBottom: i === ROLES.length - 1 ? 'none' : '1px solid var(--line-2)' }}
        >
          <div>
            <div
              className="text-[13px] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t(`roles.${role}.label`)}
            </div>
            <div
              className="mt-0.5 text-[11.5px] text-[var(--ink-5)]"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t(`roles.${role}.desc`)}
            </div>
          </div>
          <Select
            value={routing[role]}
            onChange={(v) => assignRole(role, v)}
            options={options}
            placeholder={t('unassigned')}
            disabled={savingRole === role || configs.length === 0}
            ariaLabel={t(`roles.${role}.label`)}
          />
        </div>
      ))}
    </div>
  );
}

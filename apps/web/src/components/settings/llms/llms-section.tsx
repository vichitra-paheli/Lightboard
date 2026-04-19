'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { LightboardLoader } from '@/components/brand';

import { PrimaryButton, SettingsPage } from '../primitives';
import { LlmCard } from './llm-card';
import { LlmDrawer, type LlmDrawerMode } from './llm-drawer';
import { RoutingCard } from './routing-card';
import { useLlmData } from './use-llm-data';

/**
 * Composes the LLM Providers section: routing card on top, configured-models
 * list below, and a right-side drawer for create / edit. Matches the
 * handoff `LLMsSection` (LLMs.jsx lines 38–65).
 */
export function LlmsSection() {
  const t = useTranslations('settings.llms');
  const { configs, routing, loading, refetch } = useLlmData();
  const [drawer, setDrawer] = useState<LlmDrawerMode | null>(null);

  function handleSaved() {
    setDrawer(null);
    void refetch();
  }

  return (
    <>
      <SettingsPage
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={<PrimaryButton onClick={() => setDrawer({ kind: 'new' })}>{t('addModel')}</PrimaryButton>}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <LightboardLoader size={48} />
            <p className="text-sm text-[var(--ink-3)]">{t('loading')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <RoutingCard routing={routing} configs={configs} onUpdated={refetch} />
            <div>
              <div
                className="mb-2.5 pl-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {t('configs.sectionLabel')}
              </div>
              {configs.length === 0 ? (
                <EmptyState t={t} onAdd={() => setDrawer({ kind: 'new' })} />
              ) : (
                <div className="flex flex-col gap-2.5">
                  {configs.map((c) => (
                    <LlmCard
                      key={c.id}
                      config={c}
                      routing={routing}
                      onEdit={(id) => {
                        const cfg = configs.find((x) => x.id === id);
                        if (cfg) setDrawer({ kind: 'edit', config: cfg });
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SettingsPage>
      {drawer && (
        <LlmDrawer
          mode={drawer}
          routing={routing}
          onClose={() => setDrawer(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

/** Empty state shown when the org has no configs yet. */
function EmptyState({
  t,
  onAdd,
}: {
  t: ReturnType<typeof useTranslations>;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-[10px] border border-[var(--line-1)] bg-[var(--bg-2)] px-6 py-10 text-center">
      <p
        className="text-[13.5px] text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {t('configs.empty')}
      </p>
      <div className="mt-5 inline-block">
        <PrimaryButton onClick={onAdd} size="sm">
          {t('addModel')}
        </PrimaryButton>
      </div>
    </div>
  );
}

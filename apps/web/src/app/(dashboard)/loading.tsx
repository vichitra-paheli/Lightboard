import { useTranslations } from 'next-intl';

import { LightboardLoader } from '@/components/brand';

/**
 * Suspense fallback for every `(dashboard)` segment. The dashboard
 * `layout.tsx` already wraps children in `<AppShell>`, so this loading
 * view renders inside the shell chrome automatically — we only own the
 * inner content area here.
 *
 * Uses the 96px LightboardLoader plus a mono uppercase "Loading" label so
 * the transition reads as the same brand moment as the login backdrop.
 */
export default function DashboardLoading() {
  const t = useTranslations('common');

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <LightboardLoader size={96} />
      <p
        style={{
          fontFamily:
            'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-5)',
        }}
      >
        {t('loading')}
      </p>
    </div>
  );
}

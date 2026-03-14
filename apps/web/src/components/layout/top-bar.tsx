'use client';

import { useTranslations } from 'next-intl';

/**
 * Top bar component with page title and actions.
 * Renders instantly from static content — no loading states.
 */
export function TopBar({ title }: { title?: string }) {
  const t = useTranslations('common');

  return (
    <header className="flex h-14 items-center border-b border-border bg-background px-6">
      <h1 className="text-lg font-semibold">{title ?? t('appName')}</h1>
    </header>
  );
}

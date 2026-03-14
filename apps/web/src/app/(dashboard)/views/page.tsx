import { useTranslations } from 'next-intl';

/**
 * Views page — list of saved views.
 * Full implementation in Phase 2.
 */
export default function ViewsPage() {
  const t = useTranslations('views');

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
      <p className="mt-2 text-muted-foreground">{t('emptyState')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t('createFirst')}</p>
    </div>
  );
}

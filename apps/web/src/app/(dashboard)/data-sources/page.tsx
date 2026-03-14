import { useTranslations } from 'next-intl';

/**
 * Data Sources page — manage database connections.
 * Full implementation in D11.
 */
export default function DataSourcesPage() {
  const t = useTranslations('dataSources');

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
      <p className="mt-2 text-muted-foreground">{t('emptyState')}</p>
    </div>
  );
}

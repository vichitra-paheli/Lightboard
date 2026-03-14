import { useTranslations } from 'next-intl';

/**
 * Settings page — application configuration.
 * Sub-pages (Data Sources, etc.) added in later deliverables.
 */
export default function SettingsPage() {
  const t = useTranslations('settings');

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
    </div>
  );
}

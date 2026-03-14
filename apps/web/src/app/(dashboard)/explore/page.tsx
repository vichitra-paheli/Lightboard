import { useTranslations } from 'next-intl';

/**
 * Explore page — chat with AI agent and see live charts.
 * Full implementation in D10.
 */
export default function ExplorePage() {
  const t = useTranslations('explore');

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold tracking-tight">{t('title')}</h2>
      <p className="mt-2 text-muted-foreground">{t('placeholder')}</p>
    </div>
  );
}

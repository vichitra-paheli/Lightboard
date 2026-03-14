import { useTranslations } from 'next-intl';

/**
 * Home page — landing view after login.
 */
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-3xl font-bold tracking-tight">{t('title')}</h2>
      <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
    </div>
  );
}

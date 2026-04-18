import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

/**
 * Auth layout — thin passthrough.
 *
 * The full-viewport chrome (grid backdrop, sigil, tagline, top-left tag,
 * bottom-right fine print, frosted card) is owned by {@link AuthShell}
 * inside each form component. This layout exists only to wire the
 * `NextIntlClientProvider` for the client-side `useTranslations` calls.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

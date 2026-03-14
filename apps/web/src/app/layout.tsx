import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import '@/styles/globals.css';

/**
 * Root metadata for the application.
 */
export const metadata: Metadata = {
  title: 'Lightboard',
  description: 'AI-native data exploration and visualization platform',
};

/**
 * Root layout wrapping the entire application.
 * Provides i18n context to all client components.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

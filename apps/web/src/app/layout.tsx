import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ViewTransitions } from 'next-view-transitions';

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
 * Provides i18n context and view transitions to all client components.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <ViewTransitions>
      <html lang={locale} suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('lightboard-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark');else if(t==='light')document.documentElement.classList.add('light');}catch(e){}})();`,
            }}
          />
        </head>
        <body className="min-h-screen bg-background font-sans antialiased">
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}

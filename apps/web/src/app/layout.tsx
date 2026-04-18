import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { ViewTransitions } from 'next-view-transitions';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import '@/styles/globals.css';

/**
 * Display typeface — used for page and chart headings.
 * Exposed as `--font-display` for use via the design-system token.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
});

/**
 * Body typeface — used for paragraphs, messages, and the bulk of UI.
 * Exposed as `--font-body` for use via the design-system token.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-body',
});

/**
 * Mono typeface — used for eyebrows, tags, timestamps, and numeric tables.
 * Exposed as `--font-mono` for use via the design-system token.
 */
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
});

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
 * The app is force-dark — light theme was removed in the UI polish pass.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <ViewTransitions>
      <html
        lang={locale}
        className={`dark ${spaceGrotesk.variable} ${inter.variable} ${jetBrainsMono.variable}`}
        suppressHydrationWarning
      >
        <body className="min-h-screen bg-background font-sans antialiased">
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}

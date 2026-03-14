import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@lightboard/ui', '@lightboard/db', '@lightboard/query-ir', '@lightboard/viz-core'],
  serverExternalPackages: ['pg', '@node-rs/argon2'],
  devIndicators: false,
};

export default withNextIntl(nextConfig);

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: [
    '@lightboard/agent',
    '@lightboard/connector-postgres',
    '@lightboard/connector-sdk',
    '@lightboard/db',
    '@lightboard/query-ir',
    '@lightboard/ui',
    '@lightboard/viz-core',
  ],
  serverExternalPackages: ['pg', 'pg-cursor', '@node-rs/argon2', '@anthropic-ai/sdk'],
  devIndicators: false,
};

export default withNextIntl(nextConfig);

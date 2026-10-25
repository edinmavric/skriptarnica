import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// Validates the environment at startup (dev, build, start). Throws on an invalid env.
import { env } from './src/env';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
];

const storage = new URL(env.NEXT_PUBLIC_STORAGE_PUBLIC_URL);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // radix-ui is a barrel of every primitive; import only what each module uses (SPEC §8.2).
  experimental: { optimizePackageImports: ['radix-ui'] },
  poweredByHeader: false,
  // Dev logs print every Server Function call with its arguments: passwords, 2FA codes, IBANs.
  logging: { serverFunctions: false },
  // Native/WASM packages used by background jobs; loaded from node_modules at runtime.
  serverExternalPackages: ['mupdf', 'sharp', 'pdf-lib'],
  // Fonts read at runtime by the Open Graph and icon image routes (next/og needs TTF data).
  outputFileTracingIncludes: { '/**/*': ['./src/assets/fonts/*.ttf'] },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: storage.protocol.replace(':', '') as 'http' | 'https',
        hostname: storage.hostname,
        ...(storage.port ? { port: storage.port } : {}),
        pathname: `${storage.pathname.replace(/\/$/, '')}/**`,
      },
    ],
    // Local storage runs on localhost (a private IP); allowed only outside production.
    dangerouslyAllowLocalIP: env.APP_ENV !== 'production',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withSentryConfig(withNextIntl(nextConfig), {
  org: env.SENTRY_ORG,
  project: env.SENTRY_PROJECT,
  authToken: env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !env.SENTRY_AUTH_TOKEN },
  widenClientFileUpload: true,
});

// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

// Deployed as a GitHub Pages *project* site, so everything lives under /token-arena.
// For a user site or custom domain, change `site` and drop `base`.
export default defineConfig({
  site: 'https://thornaci.github.io',
  base: '/token-arena',
  output: 'static',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'tr'],
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [react()],
  vite: {
    plugins: [
      tailwindcss(),
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        // Server-side (build-time prerender) locale is pinned by
        // src/middleware.ts; in the browser the URL decides.
        strategy: ['url', 'baseLocale'],
        // `*://*:*` = any protocol/host/port (the explicit port wildcard also
        // matches port-less URLs; without it, localhost:4321 fails to match).
        urlPatterns: [
          {
            pattern: '*://*:*/token-arena/:path(.*)?',
            localized: [
              ['en', '*://*:*/token-arena/en{/:path(.*)}?'],
              ['tr', '*://*:*/token-arena/tr{/:path(.*)}?'],
            ],
          },
        ],
        isServer: 'import.meta.env.SSR',
      }),
    ],
  },
});

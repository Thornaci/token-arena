// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';

const BASE = '/token-arena';
const LOCALES = ['en', 'tr', 'es', 'fr', 'zh'];

// Pages that once shipped and have since moved or been removed. GitHub Pages
// has no server redirects, so Astro emits a meta-refresh page at each old path.
// Sources are base-relative; destinations are not, so they carry BASE.
const MOVED_PAGES = {
  'lessons/10-sandbox/l10-1': 'lessons/11-sandbox/l11-1/', // harness took slot M10
  summary: '', // completion summary removed with XP
};

// Deployed as a GitHub Pages *project* site, so everything lives under /token-arena.
// For a user site or custom domain, change `site` and drop `base`.
export default defineConfig({
  site: 'https://thornaci.github.io',
  base: BASE,
  output: 'static',
  redirects: Object.fromEntries(
    LOCALES.flatMap((locale) =>
      Object.entries(MOVED_PAGES).map(([from, to]) => [`/${locale}/${from}`, `${BASE}/${locale}/${to}`]),
    ),
  ),
  i18n: {
    defaultLocale: 'en',
    locales: LOCALES,
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  integrations: [react()],
  vite: {
    // The L6.2 worker's dependency graph code-splits (transformers.js loads
    // its backends dynamically), which Vite's default iife worker format
    // cannot bundle — module workers are required.
    worker: { format: 'es' },
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
              ['es', '*://*:*/token-arena/es{/:path(.*)}?'],
              ['fr', '*://*:*/token-arena/fr{/:path(.*)}?'],
              ['zh', '*://*:*/token-arena/zh{/:path(.*)}?'],
            ],
          },
        ],
        isServer: 'import.meta.env.SSR',
      }),
    ],
  },
});

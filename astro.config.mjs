// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

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
    plugins: [tailwindcss()],
  },
});

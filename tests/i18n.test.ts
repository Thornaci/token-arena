import { describe, expect, it } from 'vitest';
// The Paraglide vite plugin compiles messages/ into src/paraglide before
// tests run (vitest boots through getViteConfig → astro's vite plugins).
import { baseLocale, extractLocaleFromUrl, locales } from '@/paraglide/runtime';
import * as m from '@/paraglide/messages';

describe('paraglide runtime', () => {
  it('is configured for en (base) + tr', () => {
    expect([...locales].sort()).toEqual(['en', 'tr']);
    expect(baseLocale).toBe('en');
  });

  it('extracts the locale from dev and production URLs (base path aware)', () => {
    expect(extractLocaleFromUrl('http://localhost:4321/token-arena/tr/')).toBe('tr');
    expect(extractLocaleFromUrl('http://localhost:4321/token-arena/en/lessons/l1-1')).toBe('en');
    expect(extractLocaleFromUrl('https://thornaci.github.io/token-arena/tr/lessons/l1-1')).toBe(
      'tr',
    );
    expect(extractLocaleFromUrl('https://thornaci.github.io/token-arena/en/')).toBe('en');
  });

  it('serves messages for an explicit locale', () => {
    expect(m.app_tagline({}, { locale: 'en' })).toBe('See what the model sees.');
    expect(m.app_tagline({}, { locale: 'tr' })).toBe('Modelin gördüğünü gör.');
  });
});

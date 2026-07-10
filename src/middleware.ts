import { defineMiddleware } from 'astro:middleware';
import { assertIsLocale, baseLocale, overwriteGetLocale } from '@/paraglide/runtime';

/**
 * Pins the Paraglide locale for each page render. Astro runs middleware
 * during static prerendering too, so build-time m.*() calls localize
 * correctly without threading a locale argument through every call.
 *
 * Relies on Astro's default `build.concurrency: 1`: the resolver is a
 * module-level global, and parallel page renders would race on it.
 */
export const onRequest = defineMiddleware((context, next) => {
  const locale = context.currentLocale ?? baseLocale;
  overwriteGetLocale(() => assertIsLocale(locale));
  return next();
});

import * as m from '@/paraglide/messages';
import type { Locale } from '@/lib/locales';

type MessageFn = (
  params?: Record<string, string | number>,
  options?: { locale?: Locale },
) => string;

/**
 * Resolves a lesson-data i18n key (a plain string) to its message.
 *
 * Dynamic lookup opts these messages out of tree-shaking, which is fine:
 * lesson prose IS the page's content. A missing key returns the key itself —
 * visible, greppable, and prevented for real lessons by the content schema.
 */
export function lessonText(
  key: string,
  locale?: Locale,
  params?: Record<string, string | number>,
): string {
  const candidate = (m as Record<string, unknown>)[key];
  if (typeof candidate !== 'function') return key;
  return (candidate as MessageFn)(params ?? {}, locale ? { locale } : undefined);
}

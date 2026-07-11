import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';
import { lessonText } from '@/lib/lessonText';
import type { Locale } from '@/lib/locales';

/**
 * Localized screen-reader wiring for every drag surface. Draggables and drop
 * zones register a human-readable `label` in their dnd `data`, so
 * announcements name real objects ("Attached file, 3,000 tokens"), never ids.
 */

interface WithLabelData {
  data: { current?: Record<string, unknown> | undefined };
}

function labelOf(entry: WithLabelData | null | undefined): string {
  const label = entry?.data.current?.label;
  return typeof label === 'string' ? label : '';
}

export function dndInstructions(locale: Locale): ScreenReaderInstructions {
  return { draggable: lessonText('game_dnd_instructions', locale) };
}

export function dndAnnouncements(locale: Locale): Announcements {
  const t = (key: string, params?: Record<string, string | number>) =>
    lessonText(key, locale, params);
  return {
    onDragStart: ({ active }) => t('game_dnd_pickup', { item: labelOf(active) }),
    onDragOver: ({ active, over }) =>
      over ? t('game_dnd_over', { item: labelOf(active), target: labelOf(over) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? t('game_dnd_drop', { item: labelOf(active), target: labelOf(over) })
        : t('game_dnd_drop_nowhere', { item: labelOf(active) }),
    onDragCancel: ({ active }) => t('game_dnd_cancel', { item: labelOf(active) }),
  };
}

import { MODULES } from '@/content/modules';
import type { ModuleId } from '@/content/schema';

/** The slice of lesson data the map and unlock logic need (serializable). */
export interface LessonMeta {
  /** Lesson id from the data, e.g. "L1.1". */
  id: string;
  /** Collection entry id, used in URLs, e.g. "01-tokens/l1-1". */
  slug: string;
  module: ModuleId;
  order: number;
  titleKey: string;
  xp: number;
}

const MODULE_ORDER = new Map(MODULES.map((mod) => [mod.id, mod.order]));

export function sortLessons(lessons: readonly LessonMeta[]): LessonMeta[] {
  return [...lessons].sort((a, b) => {
    const moduleDiff = (MODULE_ORDER.get(a.module) ?? 99) - (MODULE_ORDER.get(b.module) ?? 99);
    return moduleDiff !== 0 ? moduleDiff : a.order - b.order;
  });
}

/**
 * Sequential unlock: a lesson opens when the previous one is completed.
 * A completed lesson is always unlocked — inserting a new lesson into the
 * curriculum must never lock out progress a player already earned.
 */
export function isUnlocked(
  sorted: readonly LessonMeta[],
  index: number,
  completedLevels: readonly string[],
): boolean {
  if (index <= 0) return true;
  const lesson = sorted[index];
  if (lesson !== undefined && completedLevels.includes(lesson.id)) return true;
  const previous = sorted[index - 1];
  return previous !== undefined && completedLevels.includes(previous.id);
}

export function nextLesson(
  sorted: readonly LessonMeta[],
  currentId: string,
): LessonMeta | null {
  const index = sorted.findIndex((lesson) => lesson.id === currentId);
  if (index === -1 || index + 1 >= sorted.length) return null;
  return sorted[index + 1] ?? null;
}

/** First not-yet-completed lesson — the map's "continue" target. */
export function firstOpenLesson(
  sorted: readonly LessonMeta[],
  completedLevels: readonly string[],
): LessonMeta | null {
  return sorted.find((lesson) => !completedLevels.includes(lesson.id)) ?? sorted[0] ?? null;
}

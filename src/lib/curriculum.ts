import { MODULES } from '@/content/modules';
import type { ModuleId } from '@/content/schema';

/** The slice of lesson data the map and unlock logic need (serializable). */
export interface LessonMeta {
  /** Stable internal key from the data, e.g. "L1.1" — never shown to players. */
  id: string;
  /** Collection entry id, used in URLs, e.g. "01-tokens/l1-1". */
  slug: string;
  module: ModuleId;
  order: number;
  titleKey: string;
}

const MODULE_ORDER = new Map(MODULES.map((mod, index) => [mod.id, index]));

/** The module's number on the map — its position in MODULES (onboarding = 0). */
export function moduleNumber(moduleId: ModuleId): number {
  return MODULE_ORDER.get(moduleId) ?? -1;
}

/**
 * What the player sees instead of the internal id: "<module number>.<position
 * in module>", derived from the current order. Ids stay stable keys for
 * progress, URLs and i18n prefixes; only these labels move when modules do.
 */
export function lessonLabels(sorted: readonly LessonMeta[]): Map<string, string> {
  const labels = new Map<string, string>();
  const seenPerModule = new Map<ModuleId, number>();
  for (const lesson of sorted) {
    const position = (seenPerModule.get(lesson.module) ?? 0) + 1;
    seenPerModule.set(lesson.module, position);
    labels.set(lesson.id, `${moduleNumber(lesson.module)}.${position}`);
  }
  return labels;
}

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

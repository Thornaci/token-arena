import { persistentAtom } from '@nanostores/persistent';
import { isLocale, type Locale } from '@/lib/locales';

export interface Progress {
  version: 3;
  completedLevels: string[];
  badges: string[];
  /** lessonId → highest hint tier revealed (1 nudge, 2 strong, 3 reveal). */
  hintsUsed: Record<string, number>;
  settings: Record<string, unknown>;
}

export const DEFAULT_PROGRESS: Progress = {
  version: 3,
  completedLevels: [],
  badges: [],
  hintsUsed: {},
  settings: {},
};

export const LOCALE_STORAGE_KEY = 'ta:locale';

/**
 * Accepts any historical (or hand-edited) payload and returns a valid
 * current-version Progress, dropping anything malformed.
 */
/**
 * → v3: the harness module took slot M10, so the sandbox capstone moved
 * L10.1 → L11.1. Every payload below v3 predates the harness: the only v2 that
 * ever shipped was the reverted gamification build, whose L10.1 is still the
 * sandbox. Under v3, L10.1 is a real (different) lesson.
 */
const PRE_HARNESS_LEVEL_RENAMES: Readonly<Record<string, string>> = { 'L10.1': 'L11.1' };

export function migrateProgress(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PROGRESS };
  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : 1;
  let completedLevels = isStringArray(record.completedLevels) ? record.completedLevels : [];
  let hintsUsed: Record<string, number> = isHintRecord(record.hintsUsed) ? { ...record.hintsUsed } : {};
  // migrations run oldest first
  if (version < 3) {
    completedLevels = completedLevels.map((id) => PRE_HARNESS_LEVEL_RENAMES[id] ?? id);
    hintsUsed = Object.fromEntries(
      Object.entries(hintsUsed).map(([id, tier]) => [PRE_HARNESS_LEVEL_RENAMES[id] ?? id, tier]),
    );
  }
  return {
    version: 3,
    completedLevels: dedupe(completedLevels),
    badges: isStringArray(record.badges) ? dedupe(record.badges) : [],
    hintsUsed,
    settings:
      typeof record.settings === 'object' && record.settings !== null && !Array.isArray(record.settings)
        ? { ...(record.settings as Record<string, unknown>) }
        : {},
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isHintRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((tier) => typeof tier === 'number')
  );
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

export const progress = persistentAtom<Progress>('ta:progress', DEFAULT_PROGRESS, {
  encode: JSON.stringify,
  decode: (raw) => {
    try {
      return migrateProgress(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_PROGRESS };
    }
  },
});

/** Records completion once per level — replays never double-count. */
export function completeLevel(levelId: string): void {
  const current = progress.get();
  if (current.completedLevels.includes(levelId)) return;
  progress.set({
    ...current,
    completedLevels: [...current.completedLevels, levelId],
  });
}

export function awardBadge(badgeId: string): void {
  const current = progress.get();
  if (current.badges.includes(badgeId)) return;
  progress.set({ ...current, badges: [...current.badges, badgeId] });
}

/** Records the deepest hint tier revealed for a lesson. */
export function useHint(levelId: string, tier: number): void {
  const current = progress.get();
  const highest = Math.max(current.hintsUsed[levelId] ?? 0, tier);
  progress.set({ ...current, hintsUsed: { ...current.hintsUsed, [levelId]: highest } });
}

export function isLevelCompleted(state: Progress, levelId: string): boolean {
  return state.completedLevels.includes(levelId);
}

export function solvedWithoutHints(state: Progress, levelId: string): boolean {
  return isLevelCompleted(state, levelId) && !(state.hintsUsed[levelId] ?? 0);
}

export function resetProgress(): void {
  progress.set({ ...DEFAULT_PROGRESS });
}

// ---------------------------------------------------------------------------
// Export / import — lets users move progress between browsers, no backend.

export interface ProgressExport extends Progress {
  locale: Locale | null;
  exportedAt: string;
}

function safeGetStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return stored !== null && isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function safeSetStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // storage unavailable — nothing to persist
  }
}

export function exportProgress(): string {
  const bundle: ProgressExport = {
    ...progress.get(),
    locale: safeGetStoredLocale(),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(bundle, null, 2);
}

export type ImportResult = { ok: true } | { ok: false; reason: 'invalid-json' | 'invalid-shape' };

export function importProgress(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid-shape' };
  }
  progress.set(migrateProgress(parsed));
  const locale = (parsed as Record<string, unknown>).locale;
  if (typeof locale === 'string' && isLocale(locale)) {
    safeSetStoredLocale(locale);
  }
  return { ok: true };
}

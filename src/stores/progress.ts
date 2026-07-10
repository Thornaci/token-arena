import { persistentAtom } from '@nanostores/persistent';
import { isLocale, type Locale } from '@/lib/locales';

export type ToolChoice = 'claude-code' | 'codex' | 'cursor' | 'curious';

const TOOL_CHOICES: readonly ToolChoice[] = ['claude-code', 'codex', 'cursor', 'curious'];

export interface Progress {
  version: 1;
  /** Primary tool picked at onboarding; only changes which ecosystem tab shows by default. */
  tool: ToolChoice | null;
  completedLevels: string[];
  xp: number;
  badges: string[];
  /** lessonId → highest hint tier revealed (1 nudge, 2 strong, 3 reveal). */
  hintsUsed: Record<string, number>;
  settings: Record<string, unknown>;
}

export const DEFAULT_PROGRESS: Progress = {
  version: 1,
  tool: null,
  completedLevels: [],
  xp: 0,
  badges: [],
  hintsUsed: {},
  settings: {},
};

export const LOCALE_STORAGE_KEY = 'ta:locale';

/**
 * Accepts any historical (or hand-edited) payload and returns a valid
 * current-version Progress, dropping anything malformed.
 */
export function migrateProgress(raw: unknown): Progress {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_PROGRESS };
  const record = raw as Record<string, unknown>;
  // version 1 is the only schema so far; future versions migrate here, oldest first
  return {
    version: 1,
    tool: TOOL_CHOICES.includes(record.tool as ToolChoice) ? (record.tool as ToolChoice) : null,
    completedLevels: isStringArray(record.completedLevels) ? dedupe(record.completedLevels) : [],
    xp: typeof record.xp === 'number' && Number.isFinite(record.xp) && record.xp >= 0 ? record.xp : 0,
    badges: isStringArray(record.badges) ? dedupe(record.badges) : [],
    hintsUsed: isHintRecord(record.hintsUsed) ? { ...record.hintsUsed } : {},
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

export function setTool(tool: ToolChoice): void {
  progress.set({ ...progress.get(), tool });
}

/** Awards XP once per level — replays never double-count. */
export function completeLevel(levelId: string, xpAward: number): void {
  const current = progress.get();
  if (current.completedLevels.includes(levelId)) return;
  progress.set({
    ...current,
    completedLevels: [...current.completedLevels, levelId],
    xp: current.xp + xpAward,
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

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestStorage, useTestStorageEngine } from '@nanostores/persistent';
import {
  awardBadge,
  completeLevel,
  DEFAULT_PROGRESS,
  exportProgress,
  importProgress,
  isLevelCompleted,
  migrateProgress,
  progress,
  resetProgress,
  setTool,
  solvedWithoutHints,
  useHint,
} from '@/stores/progress';

beforeAll(() => {
  useTestStorageEngine();
});

beforeEach(() => {
  cleanTestStorage();
  resetProgress();
});

describe('completeLevel', () => {
  it('records completion and awards XP once, even on replay', () => {
    completeLevel('L1.1', 100);
    completeLevel('L1.1', 100);
    const state = progress.get();
    expect(state.completedLevels).toEqual(['L1.1']);
    expect(state.xp).toBe(100);
    expect(isLevelCompleted(state, 'L1.1')).toBe(true);
    expect(isLevelCompleted(state, 'L1.2')).toBe(false);
  });
});

describe('badges and hints', () => {
  it('deduplicates badges', () => {
    awardBadge('tokenizer-whisperer');
    awardBadge('tokenizer-whisperer');
    expect(progress.get().badges).toEqual(['tokenizer-whisperer']);
  });

  it('keeps the deepest hint tier and feeds the no-hints mastery flag', () => {
    useHint('L1.1', 1);
    useHint('L1.1', 3);
    useHint('L1.1', 2);
    expect(progress.get().hintsUsed['L1.1']).toBe(3);

    completeLevel('L1.1', 100);
    completeLevel('L1.2', 100);
    const state = progress.get();
    expect(solvedWithoutHints(state, 'L1.1')).toBe(false);
    expect(solvedWithoutHints(state, 'L1.2')).toBe(true);
  });
});

describe('setTool', () => {
  it('stores the onboarding tool choice', () => {
    setTool('claude-code');
    expect(progress.get().tool).toBe('claude-code');
  });
});

describe('migrateProgress', () => {
  it('returns defaults for garbage input', () => {
    expect(migrateProgress(null)).toEqual(DEFAULT_PROGRESS);
    expect(migrateProgress('nonsense')).toEqual(DEFAULT_PROGRESS);
    expect(migrateProgress(42)).toEqual(DEFAULT_PROGRESS);
  });

  it('drops malformed fields while keeping valid ones', () => {
    const migrated = migrateProgress({
      version: 1,
      tool: 'not-a-tool',
      completedLevels: ['L1.1', 'L1.1', 7],
      xp: -50,
      badges: ['a'],
      hintsUsed: { 'L1.1': 'three' },
      settings: null,
    });
    expect(migrated.tool).toBeNull();
    expect(migrated.completedLevels).toEqual([]); // non-string entry poisons the array
    expect(migrated.xp).toBe(0);
    expect(migrated.badges).toEqual(['a']);
    expect(migrated.hintsUsed).toEqual({});
    expect(migrated.settings).toEqual({});
  });

  it('deduplicates completed levels from hand-edited payloads', () => {
    const migrated = migrateProgress({ completedLevels: ['a', 'a', 'b'] });
    expect(migrated.completedLevels).toEqual(['a', 'b']);
  });
});

describe('export / import round-trip', () => {
  it('restores progress from an exported bundle', () => {
    setTool('cursor');
    completeLevel('L1.1', 100);
    useHint('L2.1', 1);
    const exported = exportProgress();

    resetProgress();
    expect(progress.get().xp).toBe(0);

    const result = importProgress(exported);
    expect(result).toEqual({ ok: true });
    const state = progress.get();
    expect(state.tool).toBe('cursor');
    expect(state.completedLevels).toEqual(['L1.1']);
    expect(state.xp).toBe(100);
    expect(state.hintsUsed).toEqual({ 'L2.1': 1 });
  });

  it('rejects invalid payloads without touching current progress', () => {
    completeLevel('L1.1', 100);
    expect(importProgress('{not json')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(importProgress('[1,2,3]')).toEqual({ ok: false, reason: 'invalid-shape' });
    expect(progress.get().completedLevels).toEqual(['L1.1']);
  });
});

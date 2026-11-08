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
  it('records completion once, even on replay', () => {
    completeLevel('L1.1');
    completeLevel('L1.1');
    const state = progress.get();
    expect(state.completedLevels).toEqual(['L1.1']);
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

    completeLevel('L1.1');
    completeLevel('L1.2');
    const state = progress.get();
    expect(solvedWithoutHints(state, 'L1.1')).toBe(false);
    expect(solvedWithoutHints(state, 'L1.2')).toBe(true);
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
      badges: ['a'],
      hintsUsed: { 'L1.1': 'three' },
      settings: null,
    });
    expect('tool' in migrated).toBe(false); // the onboarding tool picker is gone
    expect(migrated.completedLevels).toEqual([]); // non-string entry poisons the array
    expect(migrated.badges).toEqual(['a']);
    expect(migrated.hintsUsed).toEqual({});
    expect(migrated.settings).toEqual({});
  });

  it('deduplicates completed levels from hand-edited payloads', () => {
    const migrated = migrateProgress({ completedLevels: ['a', 'a', 'b'] });
    expect(migrated.completedLevels).toEqual(['a', 'b']);
  });

  it('renames the sandbox capstone L10.1 → L11.1 for pre-harness (v1) profiles', () => {
    const migrated = migrateProgress({
      version: 1,
      completedLevels: ['L9.1', 'L10.1'],
      hintsUsed: { 'L10.1': 2 },
    });
    expect(migrated.version).toBe(3);
    expect(migrated.completedLevels).toEqual(['L9.1', 'L11.1']);
    expect(migrated.hintsUsed).toEqual({ 'L11.1': 2 });
  });

  it('treats a payload without a version as v1', () => {
    expect(migrateProgress({ completedLevels: ['L10.1'] }).completedLevels).toEqual(['L11.1']);
  });

  it('renames L10.1 on v2 profiles too — the only v2 that shipped was the pre-harness gamification build', () => {
    const migrated = migrateProgress({ version: 2, completedLevels: ['L10.1'], hintsUsed: { 'L10.1': 1 }, xp: 120 });
    expect(migrated.completedLevels).toEqual(['L11.1']);
    expect(migrated.hintsUsed).toEqual({ 'L11.1': 1 });
    expect('xp' in migrated).toBe(false);
  });

  it('leaves the NEW L10.1 alone on already-migrated (v3) profiles', () => {
    expect(migrateProgress({ version: 3, completedLevels: ['L10.1'] }).completedLevels).toEqual(['L10.1']);
  });

  it('dedupes when a v1 profile somehow holds both ids', () => {
    expect(migrateProgress({ version: 1, completedLevels: ['L10.1', 'L11.1'] }).completedLevels).toEqual(['L11.1']);
  });
});

describe('export / import round-trip', () => {
  it('restores progress from an exported bundle', () => {
    completeLevel('L1.1');
    useHint('L2.1', 1);
    const exported = exportProgress();

    resetProgress();
    expect(progress.get().completedLevels).toEqual([]);

    const result = importProgress(exported);
    expect(result).toEqual({ ok: true });
    const state = progress.get();
    expect(state.completedLevels).toEqual(['L1.1']);
    expect(state.hintsUsed).toEqual({ 'L2.1': 1 });
  });

  it('rejects invalid payloads without touching current progress', () => {
    completeLevel('L1.1');
    expect(importProgress('{not json')).toEqual({ ok: false, reason: 'invalid-json' });
    expect(importProgress('[1,2,3]')).toEqual({ ok: false, reason: 'invalid-shape' });
    expect(progress.get().completedLevels).toEqual(['L1.1']);
  });
});

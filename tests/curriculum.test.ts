import { describe, expect, it } from 'vitest';

import { MODULES } from '@/content/modules';
import {
  firstOpenLesson,
  isUnlocked,
  lessonLabels,
  moduleNumber,
  nextLesson,
  sortLessons,
  type LessonMeta,
} from '@/lib/curriculum';

const meta = (id: string, module: LessonMeta['module'], order: number): LessonMeta => ({
  id,
  slug: `${module}/${id.toLowerCase().replace('.', '-')}`,
  module,
  order,
  titleKey: 'l1_1_title',
});

// A miniature curriculum around the Tur 3 insertion point: L6.2 lands
// between L6.1 and L7.1 for players who already finished everything.
const CURRICULUM: LessonMeta[] = [
  meta('L6.1', 'sampling', 1),
  meta('L6.2', 'sampling', 2),
  meta('L7.1', 'ecosystem', 1),
  meta('L7.2', 'ecosystem', 2),
];

describe('sortLessons', () => {
  it('orders by module order, then lesson order', () => {
    const shuffled = [CURRICULUM[2]!, CURRICULUM[0]!, CURRICULUM[3]!, CURRICULUM[1]!];
    expect(sortLessons(shuffled).map((l) => l.id)).toEqual(['L6.1', 'L6.2', 'L7.1', 'L7.2']);
  });
});

describe('isUnlocked', () => {
  const sorted = sortLessons(CURRICULUM);

  it('unlocks the first lesson unconditionally', () => {
    expect(isUnlocked(sorted, 0, [])).toBe(true);
  });

  it('unlocks a lesson when its predecessor is completed', () => {
    expect(isUnlocked(sorted, 1, ['L6.1'])).toBe(true);
    expect(isUnlocked(sorted, 2, ['L6.1'])).toBe(false);
  });

  it('keeps a completed lesson unlocked even when a new predecessor is inserted', () => {
    // Veteran profile from before L6.2 existed: L6.2 is NOT completed,
    // but the already-earned L7.1/L7.2 must stay accessible on the map.
    const veteran = ['L6.1', 'L7.1', 'L7.2'];
    expect(isUnlocked(sorted, 2, veteran)).toBe(true);
    expect(isUnlocked(sorted, 3, veteran)).toBe(true);
  });

  it('still locks never-completed lessons behind an incomplete predecessor', () => {
    expect(isUnlocked(sorted, 3, ['L6.1', 'L6.2'])).toBe(false);
  });
});

describe('firstOpenLesson / nextLesson around an inserted lesson', () => {
  const sorted = sortLessons(CURRICULUM);

  it('points the continue target at the inserted lesson for a veteran profile', () => {
    expect(firstOpenLesson(sorted, ['L6.1', 'L7.1', 'L7.2'])?.id).toBe('L6.2');
  });

  it('walks the sorted order through the insertion', () => {
    expect(nextLesson(sorted, 'L6.1')?.id).toBe('L6.2');
    expect(nextLesson(sorted, 'L6.2')?.id).toBe('L7.1');
    expect(nextLesson(sorted, 'L7.2')).toBeNull();
  });
});

describe('display labels', () => {
  it('numbers modules by their position on the map', () => {
    expect(moduleNumber('onboarding')).toBe(0);
    expect(moduleNumber('tokens')).toBe(1);
    expect(moduleNumber('sampling')).toBe(MODULES.findIndex((mod) => mod.id === 'sampling'));
  });

  it('labels lessons "<module number>.<position>" regardless of their internal ids', () => {
    const labels = lessonLabels(sortLessons(CURRICULUM));
    const sampling = moduleNumber('sampling');
    const ecosystem = moduleNumber('ecosystem');
    expect(labels.get('L6.1')).toBe(`${sampling}.1`);
    expect(labels.get('L6.2')).toBe(`${sampling}.2`);
    expect(labels.get('L7.1')).toBe(`${ecosystem}.1`);
    expect(labels.get('L7.2')).toBe(`${ecosystem}.2`);
  });

  it('counts positions, not authored order values, so gaps never show', () => {
    const gappy = [meta('L1.1', 'tokens', 1), meta('L1.9', 'tokens', 9)];
    const labels = lessonLabels(sortLessons(gappy));
    expect([labels.get('L1.1'), labels.get('L1.9')]).toEqual(['1.1', '1.2']);
  });
});

describe('module sections', () => {
  it('keeps the developer modules together at the end of the map', () => {
    const firstDeveloper = MODULES.findIndex((mod) => mod.section === 'developers');
    expect(firstDeveloper).toBeGreaterThan(0);
    expect(MODULES.slice(firstDeveloper).every((mod) => mod.section === 'developers')).toBe(true);
  });
});

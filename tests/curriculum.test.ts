import { describe, expect, it } from 'vitest';

import {
  firstOpenLesson,
  isUnlocked,
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
  xp: 100,
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

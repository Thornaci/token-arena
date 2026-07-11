import { describe, expect, it } from 'vitest';
import { createRng, hashSeed } from '@/engine/rng';

describe('hashSeed', () => {
  it('is stable across runs (regression-locked literals)', () => {
    expect(hashSeed('L6.1:marble')).toBe(3345269477);
    expect(hashSeed('L6.1:marble')).toBe(hashSeed('L6.1:marble'));
  });

  it('separates nearby seeds', () => {
    expect(hashSeed('L6.1:marble')).not.toBe(hashSeed('L6.2:marble'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});

describe('createRng', () => {
  it('produces the locked sequence for a fixed seed', () => {
    const rng = createRng(12345);
    expect(rng.next()).toBeCloseTo(0.9797282678, 9);
    expect(rng.next()).toBeCloseTo(0.3067522645, 9);
    expect(rng.next()).toBeCloseTo(0.4842054215, 9);
  });

  it('stays within [0, 1)', () => {
    const rng = createRng(hashSeed('bounds'));
    for (let i = 0; i < 1000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('pickWeighted is deterministic per seed and respects weights', () => {
    const a = createRng(7);
    const b = createRng(7);
    const items = ['big', 'small'] as const;
    const sequenceA = Array.from({ length: 20 }, () => a.pickWeighted(items, [0.9, 0.1]));
    const sequenceB = Array.from({ length: 20 }, () => b.pickWeighted(items, [0.9, 0.1]));
    expect(sequenceA).toEqual(sequenceB);

    const c = createRng(99);
    let bigCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (c.pickWeighted(items, [0.9, 0.1]) === 'big') bigCount++;
    }
    expect(bigCount).toBeGreaterThan(850);
    expect(bigCount).toBeLessThan(950);
  });

  it('pickWeighted throws on an empty list', () => {
    expect(() => createRng(1).pickWeighted([], [])).toThrow();
  });
});

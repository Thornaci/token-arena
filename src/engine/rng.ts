/**
 * Seeded randomness for the one place randomness IS the lesson (the
 * Probability Wall's marble drop, spec §5 G3.3). Deterministic by
 * construction: the same seed yields the same sequence on every visit, so
 * tests can assert exact outcomes while the distribution SHAPE still
 * teaches. Never use Math.random in engine or scene code.
 */

/** FNV-1a — stable 32-bit hash for string seeds like `${lesson.id}:marble`. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T;
}

/** mulberry32 — tiny, fast, good-enough PRNG with a 32-bit state. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pickWeighted(items, weights) {
      if (items.length === 0) throw new Error('pickWeighted needs at least one item');
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
  };
}

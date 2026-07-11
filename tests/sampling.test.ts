import { describe, expect, it } from 'vitest';
import {
  applyTemperature,
  applyTopP,
  sampleDistribution,
  topCandidate,
  type Candidate,
} from '@/engine/sampling';

/** A realistic authored top-k: one clear favorite, a rival, and a tail. */
const CANDIDATES: readonly Candidate[] = [
  { token: ' Paris', logit: 4.2 },
  { token: ' the', logit: 2.1 },
  { token: ' located', logit: 1.3 },
  { token: ' France', logit: 0.8 },
  { token: ' a', logit: 0.2 },
];

describe('applyTemperature', () => {
  it('produces a probability distribution that sums to 1', () => {
    for (const temperature of [0.2, 0.7, 1.0, 1.5]) {
      const total = applyTemperature(CANDIDATES, temperature).reduce(
        (sum, c) => sum + c.probability,
        0,
      );
      expect(total).toBeCloseTo(1, 10);
    }
  });

  it('preserves the logit ranking at any temperature', () => {
    const probs = applyTemperature(CANDIDATES, 0.7).map((c) => c.probability);
    for (let i = 1; i < probs.length; i++) {
      expect(probs[i - 1]!).toBeGreaterThan(probs[i]!);
    }
  });

  it('sharpens as temperature drops and flattens as it rises', () => {
    const cold = topCandidate(applyTemperature(CANDIDATES, 0.2));
    const warm = topCandidate(applyTemperature(CANDIDATES, 1.0));
    const hot = topCandidate(applyTemperature(CANDIDATES, 1.5));
    expect(cold.probability).toBeGreaterThan(warm.probability);
    expect(warm.probability).toBeGreaterThan(hot.probability);
    // Near-greedy cold sampling concentrates almost everything on top-1.
    expect(cold.probability).toBeGreaterThan(0.99);
  });

  it('rejects non-positive temperatures instead of dividing by zero', () => {
    expect(() => applyTemperature(CANDIDATES, 0)).toThrow(/temperature/);
  });
});

describe('applyTopP', () => {
  it('keeps the smallest prefix reaching the cumulative threshold', () => {
    const weighted = applyTemperature(CANDIDATES, 1.0);
    // At temp 1.0 the favorite holds ~74% of the mass, so p=0.5 keeps only it.
    const nucleus = applyTopP(weighted, 0.5).filter((c) => c.inNucleus);
    expect(nucleus.map((c) => c.token)).toEqual([' Paris']);
  });

  it('keeps everything at p = 1', () => {
    const weighted = applyTemperature(CANDIDATES, 1.0);
    expect(applyTopP(weighted, 1).every((c) => c.inNucleus)).toBe(true);
  });

  it('cuts a longer tail at higher temperature for the same p', () => {
    const flat = sampleDistribution(CANDIDATES, 1.5, 0.9).filter((c) => c.inNucleus).length;
    const sharp = sampleDistribution(CANDIDATES, 0.2, 0.9).filter((c) => c.inNucleus).length;
    expect(sharp).toBeLessThan(flat);
  });

  it('rejects out-of-range p', () => {
    const weighted = applyTemperature(CANDIDATES, 1.0);
    expect(() => applyTopP(weighted, 0)).toThrow(/topP/);
    expect(() => applyTopP(weighted, 1.01)).toThrow(/topP/);
  });
});

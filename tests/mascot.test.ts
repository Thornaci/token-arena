import { describe, expect, it } from 'vitest';
import {
  computeMascotState,
  CONFIDENT_ENTROPY,
  FOGGY_RECALL_PCT,
  IDLE_INPUTS,
  normalizedEntropy,
  OVERWHELMED_RATIO,
  UNCERTAIN_ENTROPY,
  type MascotInputs,
} from '@/engine/mascot';

function inputs(patch: Partial<MascotInputs>): MascotInputs {
  return { ...IDLE_INPUTS, ...patch };
}

describe('mascot state priority', () => {
  it('maps each single trigger to its state', () => {
    expect(computeMascotState(IDLE_INPUTS).state).toBe('neutral');
    expect(computeMascotState(inputs({ processing: true })).state).toBe('focused');
    expect(computeMascotState(inputs({ conflictCount: 1 })).state).toBe('confused');
    expect(computeMascotState(inputs({ injectionActive: true })).state).toBe('confused');
    expect(computeMascotState(inputs({ fillRatio: OVERWHELMED_RATIO })).state).toBe('overwhelmed');
    expect(computeMascotState(inputs({ overflow: true })).state).toBe('overflow');
    expect(computeMascotState(inputs({ lastRetrieval: 'miss' })).state).toBe('foggy');
    expect(
      computeMascotState(inputs({ processing: true, needleRecallPct: FOGGY_RECALL_PCT - 1 })).state,
    ).toBe('foggy');
    expect(computeMascotState(inputs({ compacted: true })).state).toBe('forgetful');
    expect(computeMascotState(inputs({ entropyNorm: UNCERTAIN_ENTROPY })).state).toBe('uncertain');
    expect(computeMascotState(inputs({ entropyNorm: CONFIDENT_ENTROPY })).state).toBe('confident');
    expect(computeMascotState(inputs({ lastRetrieval: 'hit' })).state).toBe('confident');
    expect(computeMascotState(inputs({ celebrating: true })).state).toBe('confident');
  });

  it('resolves multi-trigger conflicts in the documented order', () => {
    // overflow beats everything
    expect(
      computeMascotState(
        inputs({ overflow: true, celebrating: true, conflictCount: 2, fillRatio: 1 }),
      ).state,
    ).toBe('overflow');
    // celebration beats compaction/confusion
    expect(
      computeMascotState(inputs({ celebrating: true, compacted: true, conflictCount: 1 })).state,
    ).toBe('confident');
    // compaction beats confusion
    expect(computeMascotState(inputs({ compacted: true, conflictCount: 1 })).state).toBe(
      'forgetful',
    );
    // confusion beats fill
    expect(
      computeMascotState(inputs({ conflictCount: 1, fillRatio: 0.99 })).state,
    ).toBe('confused');
    // overwhelmed beats foggy
    expect(
      computeMascotState(inputs({ fillRatio: 0.9, lastRetrieval: 'miss' })).state,
    ).toBe('overwhelmed');
    // foggy beats uncertain
    expect(
      computeMascotState(inputs({ lastRetrieval: 'miss', entropyNorm: 0.9 })).state,
    ).toBe('foggy');
    // uncertain beats confident-entropy
    expect(computeMascotState(inputs({ entropyNorm: 0.99, lastRetrieval: 'hit' })).state).toBe(
      'uncertain',
    );
    // mid entropy alone is neither uncertain nor confident
    expect(computeMascotState(inputs({ entropyNorm: 0.5 })).state).toBe('neutral');
  });
});

describe('normalizedEntropy', () => {
  it('is null for empty, 0 for a single candidate', () => {
    expect(normalizedEntropy([])).toBeNull();
    expect(normalizedEntropy([0, 0])).toBeNull();
    expect(normalizedEntropy([0.8])).toBe(0);
  });

  it('is 1 for a uniform distribution and low for a peaked one', () => {
    expect(normalizedEntropy([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(1, 10);
    const peaked = normalizedEntropy([0.97, 0.01, 0.01, 0.01])!;
    expect(peaked).toBeLessThan(0.35);
  });

  it('renormalizes honest top-k lists that do not sum to 1', () => {
    // same shape at half the mass → same entropy
    const full = normalizedEntropy([0.5, 0.3, 0.2])!;
    const scaled = normalizedEntropy([0.25, 0.15, 0.1])!;
    expect(scaled).toBeCloseTo(full, 10);
  });

  it('drops zero-probability entries before normalizing', () => {
    expect(normalizedEntropy([0.5, 0.5, 0])).toBeCloseTo(1, 10);
  });
});

describe('confusion meter', () => {
  it('is 0 with an empty contributor list when idle', () => {
    const view = computeMascotState(IDLE_INPUTS);
    expect(view.confusion).toBe(0);
    expect(view.contributors).toEqual([]);
  });

  it('lists contributors in fixed order with deterministic points', () => {
    const view = computeMascotState(
      inputs({
        conflictCount: 2,
        injectionActive: true,
        fillRatio: 0.9,
        needleRecallPct: 40,
        entropyNorm: 0.8,
        compacted: true,
      }),
    );
    expect(view.contributors.map((c) => c.key)).toEqual([
      'mascot_contrib_conflicts',
      'mascot_contrib_injection',
      'mascot_contrib_fill',
      'mascot_contrib_needle',
      'mascot_contrib_entropy',
      'mascot_contrib_compacted',
    ]);
    expect(view.contributors.map((c) => c.points)).toEqual([60, 15, 20, 20, 24, 10]);
    // clamped at 100
    expect(view.confusion).toBe(100);
  });

  it('overflow replaces the fill contributor and outweighs it', () => {
    const over = computeMascotState(inputs({ overflow: true, fillRatio: 1.2 }));
    expect(over.contributors).toEqual([{ key: 'mascot_contrib_overflow', points: 40 }]);
    expect(over.confusion).toBe(40);

    const warm = computeMascotState(inputs({ fillRatio: 0.75 }));
    expect(warm.contributors).toEqual([
      { key: 'mascot_contrib_fill', points: 10, params: { pct: 75 } },
    ]);
  });

  it('conflict points cap at two conflicts', () => {
    const two = computeMascotState(inputs({ conflictCount: 2 }));
    const five = computeMascotState(inputs({ conflictCount: 5 }));
    expect(two.contributors[0]!.points).toBe(60);
    expect(five.contributors[0]!.points).toBe(60);
    expect(five.contributors[0]!.params).toEqual({ count: 5 });
  });
});

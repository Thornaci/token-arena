import { describe, expect, it } from 'vitest';
import type { ContextState } from '@/engine/contextModel';
import { getModelProfile } from '@/engine/modelProfiles';
import {
  acknowledgeFreeze,
  advance,
  advanceUntilPause,
  canAdvance,
  createSim,
  isDone,
  resolveQuestion,
  type SimStep,
} from '@/engine/simEngine';

const initial: ContextState = {
  model: getModelProfile('generic-200k'),
  blocks: [
    { id: 'sys', role: 'system', kind: 'message', textKey: 'sim.sys', fixedTokens: 20 },
  ],
  reservedOutput: 0,
};

const steps: readonly SimStep[] = [
  { type: 'narrate', textKey: 'sim.intro' },
  {
    type: 'addBlock',
    block: { id: 'u1', role: 'user', kind: 'message', textKey: 'sim.u1', fixedTokens: 12 },
  },
  { type: 'sendRequest' },
  {
    type: 'addBlock',
    block: { id: 'a1', role: 'assistant', kind: 'message', textKey: 'sim.a1', fixedTokens: 30 },
  },
  { type: 'ask', questionId: 'q1' },
  { type: 'freeze', noteKey: 'sim.why', targetBlockId: 'u1' },
  { type: 'removeBlock', blockId: 'u1' },
];

describe('simEngine', () => {
  it('applies steps in order and mutates context accordingly', () => {
    let sim = createSim(initial, steps);
    sim = advance(sim); // narrate
    expect(sim.context.blocks).toHaveLength(1);
    sim = advance(sim); // addBlock u1
    expect(sim.context.blocks.map((b) => b.id)).toEqual(['sys', 'u1']);
    sim = advance(sim); // sendRequest
    sim = advance(sim); // addBlock a1
    expect(sim.context.blocks).toHaveLength(3);
  });

  it('pauses on ask and resumes only for the matching question', () => {
    let sim = advanceUntilPause(createSim(initial, steps));
    expect(sim.awaiting).toBe('q1');
    expect(canAdvance(sim)).toBe(false);
    expect(advance(sim)).toBe(sim); // advancing while paused is a no-op

    expect(resolveQuestion(sim, 'other')).toBe(sim);
    sim = resolveQuestion(sim, 'q1');
    expect(sim.awaiting).toBeNull();
    expect(canAdvance(sim)).toBe(true);
  });

  it('freezes for teaching moments and continues after acknowledgement', () => {
    let sim = advanceUntilPause(createSim(initial, steps));
    sim = resolveQuestion(sim, 'q1');
    sim = advanceUntilPause(sim);
    expect(sim.frozen?.noteKey).toBe('sim.why');
    expect(sim.frozen?.targetBlockId).toBe('u1');

    sim = acknowledgeFreeze(sim);
    sim = advanceUntilPause(sim);
    expect(sim.context.blocks.map((b) => b.id)).toEqual(['sys', 'a1']);
    expect(isDone(sim)).toBe(true);
  });

  it('replays deterministically: two runs produce identical logs and contexts', () => {
    const run = () => {
      let sim = advanceUntilPause(createSim(initial, steps));
      sim = resolveQuestion(sim, 'q1');
      sim = advanceUntilPause(sim);
      sim = acknowledgeFreeze(sim);
      return advanceUntilPause(sim);
    };
    const first = run();
    const second = run();
    expect(second.log).toEqual(first.log);
    expect(second.context).toEqual(first.context);
    expect(first.log.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

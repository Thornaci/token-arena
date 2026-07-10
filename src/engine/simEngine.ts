import {
  addBlock,
  removeBlock,
  setModel,
  setReservedOutput,
  type ContextBlock,
  type ContextState,
} from './contextModel';
import { getModelProfile } from './modelProfiles';

/**
 * Scripted lesson beats. Every outcome is hand-authored so lessons are
 * deterministic and reproducible: no network, no randomness, no clocks.
 */
export type SimStep =
  | { type: 'narrate'; textKey: string }
  | { type: 'setModel'; modelId: string }
  | { type: 'setReservedOutput'; tokens: number }
  | { type: 'addBlock'; block: ContextBlock }
  | { type: 'removeBlock'; blockId: string }
  /** The envelope moment: the WHOLE current block array ships to the API. */
  | { type: 'sendRequest'; noteKey?: string }
  /** Failure-as-teaching: freeze the sim and annotate why, pointing at a block. */
  | { type: 'freeze'; noteKey: string; targetBlockId?: string }
  /** Pause until the level's interaction resolves (scoring decides pass/fail). */
  | { type: 'ask'; questionId: string };

export interface SimEvent {
  index: number;
  step: SimStep;
}

export interface SimState {
  context: ContextState;
  /** Index of the next step to apply. */
  cursor: number;
  /** questionId the sim is paused on, if any. */
  awaiting: string | null;
  /** Set by a freeze step; cleared by acknowledgeFreeze. */
  frozen: SimStep & { type: 'freeze' } | null;
  /** Applied steps, in order — the deterministic replay log. */
  log: SimEvent[];
  steps: readonly SimStep[];
}

export function createSim(initial: ContextState, steps: readonly SimStep[]): SimState {
  return {
    context: initial,
    cursor: 0,
    awaiting: null,
    frozen: null,
    log: [],
    steps,
  };
}

export function isDone(sim: SimState): boolean {
  return sim.cursor >= sim.steps.length && !sim.awaiting && !sim.frozen;
}

export function canAdvance(sim: SimState): boolean {
  return sim.cursor < sim.steps.length && !sim.awaiting && !sim.frozen;
}

/** Applies the next step. Returns the same state when paused or done. */
export function advance(sim: SimState): SimState {
  if (!canAdvance(sim)) return sim;

  const step = sim.steps[sim.cursor]!;
  const event: SimEvent = { index: sim.cursor, step };
  const base: SimState = {
    ...sim,
    cursor: sim.cursor + 1,
    log: [...sim.log, event],
  };

  switch (step.type) {
    case 'narrate':
    case 'sendRequest':
      return base;
    case 'setModel':
      return { ...base, context: setModel(sim.context, getModelProfile(step.modelId)) };
    case 'setReservedOutput':
      return { ...base, context: setReservedOutput(sim.context, step.tokens) };
    case 'addBlock':
      return { ...base, context: addBlock(sim.context, step.block) };
    case 'removeBlock':
      return { ...base, context: removeBlock(sim.context, step.blockId) };
    case 'freeze':
      return { ...base, frozen: step };
    case 'ask':
      return { ...base, awaiting: step.questionId };
  }
}

/** Runs until the sim pauses (ask/freeze) or finishes. */
export function advanceUntilPause(sim: SimState): SimState {
  let current = sim;
  while (canAdvance(current)) {
    current = advance(current);
  }
  return current;
}

export function resolveQuestion(sim: SimState, questionId: string): SimState {
  if (sim.awaiting !== questionId) return sim;
  return { ...sim, awaiting: null };
}

export function acknowledgeFreeze(sim: SimState): SimState {
  if (!sim.frozen) return sim;
  return { ...sim, frozen: null };
}

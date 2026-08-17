import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lesson } from '@/content/schema';
import type { ContextBlock } from '@/engine/contextModel';
import {
  acknowledgeFreeze,
  advance,
  canAdvance,
  createSim,
  isDone,
  type SimState,
  type SimStep,
} from '@/engine/simEngine';
import { showInspector, signalSend, updateInspectorState } from '@/stores/inspector';
import { buildContextState } from './shared';

/** One transcript row; removed blocks stay visible, struck through. */
export interface WalkEntry {
  kind: 'narration' | 'block' | 'send';
  textKey?: string;
  block?: ContextBlock;
  removed: boolean;
}

/** Anything with a scripted context: the lesson itself, or `params.sub` of subagent-sim. */
export interface WalkthroughScript {
  initialState?: Lesson['initialState'];
  steps: readonly SimStep[];
}

export interface WalkthroughOptions {
  /** Push state to the Context Inspector store (default true). Isolated sub-contexts pass false. */
  mirrorInspector?: boolean;
}

/**
 * Drives a script's steps one beat per click for walkthrough mechanics (tool
 * loop, compaction, subagent). The inspector mirrors the live context; the
 * local transcript also remembers what was dropped — that contrast IS the lesson.
 */
export function useSimWalkthrough(script: WalkthroughScript, opts: WalkthroughOptions = {}) {
  const mirrorInspector = opts.mirrorInspector ?? true;
  if (!script.initialState) throw new Error('walkthrough lessons need initialState');
  const [sim, setSim] = useState<SimState>(() =>
    createSim(buildContextState(script.initialState!), script.steps),
  );
  const [entries, setEntries] = useState<WalkEntry[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (mirrorInspector) showInspector(buildContextState(script.initialState!));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyEntry = useCallback((step: SimStep) => {
    setEntries((current) => {
      switch (step.type) {
        case 'narrate':
          return [...current, { kind: 'narration', textKey: step.textKey, removed: false }];
        case 'addBlock':
          return [...current, { kind: 'block', block: step.block, removed: false }];
        case 'removeBlock':
          return current.map((entry) =>
            entry.block?.id === step.blockId ? { ...entry, removed: true } : entry,
          );
        case 'sendRequest':
          return [...current, { kind: 'send', textKey: step.noteKey, removed: false }];
        default:
          return current;
      }
    });
  }, []);

  const step = useCallback(() => {
    setSim((current) => {
      if (current.frozen) return { ...acknowledgeFreeze(current) };
      if (!canAdvance(current)) return current;
      const next = advance(current);
      const applied = next.log[next.log.length - 1]!.step;
      applyEntry(applied);
      if (mirrorInspector) {
        if (applied.type === 'sendRequest') signalSend();
        updateInspectorState(next.context);
      }
      return next;
    });
  }, [applyEntry, mirrorInspector]);

  return {
    entries,
    context: sim.context,
    frozen: sim.frozen,
    done: isDone(sim),
    /** Index of the next step to apply — lets a host detect "past the delegation freeze". */
    cursor: sim.cursor,
    step,
  };
}

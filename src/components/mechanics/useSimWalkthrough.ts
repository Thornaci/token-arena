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

/**
 * Drives lesson.steps one beat per click for walkthrough mechanics (tool
 * loop, compaction). The inspector mirrors the live context; the local
 * transcript also remembers what was dropped — that contrast IS the lesson.
 */
export function useSimWalkthrough(lesson: Lesson) {
  if (!lesson.initialState) throw new Error('walkthrough lessons need initialState');
  const [sim, setSim] = useState<SimState>(() =>
    createSim(buildContextState(lesson.initialState!), lesson.steps),
  );
  const [entries, setEntries] = useState<WalkEntry[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    showInspector(buildContextState(lesson.initialState!));
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
      if (applied.type === 'sendRequest') signalSend();
      updateInspectorState(next.context);
      return next;
    });
  }, [applyEntry]);

  return {
    entries,
    context: sim.context,
    frozen: sim.frozen,
    done: isDone(sim),
    step,
  };
}

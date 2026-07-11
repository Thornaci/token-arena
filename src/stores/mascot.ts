import { atom, computed } from 'nanostores';
import {
  computeMascotState,
  IDLE_INPUTS,
  type MascotInputs,
  type MascotView,
} from '@/engine/mascot';
import { fillInfo, promptTooLong, type CountFn } from '@/engine/contextModel';
import { inspectorStore } from './inspector';

/**
 * Bridge between lesson mechanics and the mascot (same pattern as the
 * inspector store): mechanics push typed inputs, the mascot renders whatever
 * the current scene says the model is feeling. All transient timing
 * (celebration pulses etc.) lives here — the engine stays pure.
 */

export const mascotStore = atom<MascotInputs>({ ...IDLE_INPUTS });

export const mascotView = computed(mascotStore, (inputs): MascotView =>
  computeMascotState(inputs),
);

export function mascotReport(patch: Partial<MascotInputs>): void {
  mascotStore.set({ ...mascotStore.get(), ...patch });
}

export type MascotEvent =
  | 'send'
  | 'retrieve-hit'
  | 'retrieve-miss'
  | 'overflow'
  | 'compaction'
  | 'confuse'
  | 'pass'
  | 'reset';

const PULSE_MS = { send: 1200, retrieval: 2500, confuse: 1500, pass: 1600 } as const;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function pulse(name: string, apply: Partial<MascotInputs>, clear: Partial<MascotInputs>, ms: number) {
  const existing = timers.get(name);
  if (existing) clearTimeout(existing);
  mascotReport(apply);
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      mascotReport(clear);
    }, ms),
  );
}

export function mascotEvent(event: MascotEvent): void {
  switch (event) {
    case 'send':
      pulse('processing', { processing: true }, { processing: false }, PULSE_MS.send);
      break;
    case 'retrieve-hit':
      pulse(
        'retrieval',
        { lastRetrieval: 'hit', processing: false },
        { lastRetrieval: null },
        PULSE_MS.retrieval,
      );
      break;
    case 'retrieve-miss':
      pulse(
        'retrieval',
        { lastRetrieval: 'miss', processing: false },
        { lastRetrieval: null },
        PULSE_MS.retrieval,
      );
      break;
    case 'overflow':
      mascotReport({ overflow: true, processing: false });
      break;
    case 'compaction':
      mascotReport({ compacted: true });
      break;
    case 'confuse':
      pulse(
        'confuse',
        { conflictCount: Math.max(1, mascotStore.get().conflictCount) },
        { conflictCount: 0 },
        PULSE_MS.confuse,
      );
      break;
    case 'pass':
      pulse('pass', { celebrating: true }, { celebrating: false }, PULSE_MS.pass);
      break;
    case 'reset':
      resetMascot();
      break;
  }
}

export function resetMascot(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  mascotStore.set({ ...IDLE_INPUTS });
}

// ---------------------------------------------------------------------------
// Free ride: every inspector-backed lesson feeds the mascot automatically.
// Same fallback count rule as the inspector (authored fixedTokens in lessons).

const fallbackCount: CountFn = (text) => Math.ceil(text.length / 4);

inspectorStore.subscribe((view) => {
  if (!view) return;
  const info = fillInfo(view.state, fallbackCount);
  mascotReport({
    fillRatio: info.ratio,
    overflow: promptTooLong(view.state, fallbackCount),
  });
});

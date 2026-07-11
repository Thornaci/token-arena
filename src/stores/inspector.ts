import { atom } from 'nanostores';
import type { ContextState, ModelProfile } from '@/engine/contextModel';

/**
 * Bridge between lesson mechanics and the Context Inspector island.
 * Mechanics own the ContextState and push it here; the inspector renders
 * whatever the current lesson says the model would receive next turn.
 */
export interface InspectorView {
  state: ContextState;
  /** Lessons may lock the model picker (e.g. before the window module). */
  allowModelChange: boolean;
  /** Block to spotlight during freeze/teaching annotations. */
  highlightBlockId: string | null;
  /** Monotonic counter; each increment = one "payload shipped" moment. */
  sendSignal: number;
}

export const inspectorStore = atom<InspectorView | null>(null);

export function showInspector(state: ContextState, options?: { allowModelChange?: boolean }): void {
  inspectorStore.set({
    state,
    allowModelChange: options?.allowModelChange ?? false,
    highlightBlockId: null,
    sendSignal: 0,
  });
}

export function updateInspectorState(state: ContextState): void {
  const current = inspectorStore.get();
  if (!current) return;
  inspectorStore.set({ ...current, state });
}

export function setInspectorModel(model: ModelProfile): void {
  const current = inspectorStore.get();
  if (!current) return;
  inspectorStore.set({ ...current, state: { ...current.state, model } });
}

export function highlightBlock(blockId: string | null): void {
  const current = inspectorStore.get();
  if (!current) return;
  inspectorStore.set({ ...current, highlightBlockId: blockId });
}

/** Fires the inspector's "whole payload ships now" pulse. */
export function signalSend(): void {
  const current = inspectorStore.get();
  if (!current) return;
  inspectorStore.set({ ...current, sendSignal: current.sendSignal + 1 });
}

export function hideInspector(): void {
  inspectorStore.set(null);
}

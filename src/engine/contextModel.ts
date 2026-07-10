import type { EncodingId } from '@/lib/tokenizer';

export type Role = 'system' | 'developer' | 'user' | 'assistant' | 'tool';

export type BlockKind =
  | 'message'
  | 'config-file'
  | 'attachment'
  | 'tool-def'
  | 'tool-result';

/**
 * One block of the payload that would be sent to the API on the next turn.
 *
 * Blocks carry either live `text` (tokenized on the fly — playground and
 * free-edit contexts) or an authored `fixedTokens` count. Scripted lesson
 * simulations always use `fixedTokens`: their prose is localized, and live
 * counts would differ per locale, breaking deterministic pass/fail.
 */
export interface ContextBlock {
  id: string;
  role: Role;
  kind: BlockKind;
  /** i18n key for the block's display label. */
  labelKey?: string;
  /** i18n key for the block's display body (scripted sims). */
  textKey?: string;
  /** Literal content, tokenized live when present. */
  text?: string;
  /** Authored token count, used when `text` is absent. */
  fixedTokens?: number;
}

export interface ModelProfile {
  id: string;
  labelKey: string;
  family: 'openai' | 'anthropic' | 'google' | 'generic';
  contextWindow: number;
  /** Encoding used to count this profile's live text. */
  encoding: EncodingId;
  /** True when the encoding only approximates a proprietary tokenizer (Claude/Gemini). */
  countIsEstimate: boolean;
}

export type CountFn = (text: string) => number;

export interface ContextState {
  model: ModelProfile;
  blocks: ContextBlock[];
  /** Tokens reserved for the model's answer, including thinking tokens. */
  reservedOutput: number;
}

export function blockTokens(block: ContextBlock, count: CountFn): number {
  if (block.text !== undefined) return count(block.text);
  return block.fixedTokens ?? 0;
}

/** Input-side total: every block, regardless of kind. */
export function usedTokens(state: ContextState, count: CountFn): number {
  return state.blocks.reduce((sum, block) => sum + blockTokens(block, count), 0);
}

/** Segments of the fill bar, in display order. */
export interface ContextSegments {
  system: number;
  config: number;
  files: number;
  tools: number;
  history: number;
  reservedOutput: number;
}

export function segmentOf(block: ContextBlock): keyof Omit<ContextSegments, 'reservedOutput'> {
  if (block.kind === 'config-file') return 'config';
  if (block.kind === 'attachment') return 'files';
  if (block.kind === 'tool-def' || block.kind === 'tool-result') return 'tools';
  if (block.role === 'system' || block.role === 'developer') return 'system';
  return 'history';
}

export function segmentTotals(state: ContextState, count: CountFn): ContextSegments {
  const segments: ContextSegments = {
    system: 0,
    config: 0,
    files: 0,
    tools: 0,
    history: 0,
    reservedOutput: state.reservedOutput,
  };
  for (const block of state.blocks) {
    segments[segmentOf(block)] += blockTokens(block, count);
  }
  return segments;
}

export type FillStatus = 'ok' | 'warn' | 'over';

export interface FillInfo {
  used: number;
  reserved: number;
  window: number;
  /** (used + reserved) / window, may exceed 1. */
  ratio: number;
  status: FillStatus;
  /** Tokens over the window, 0 when within it. */
  overBy: number;
}

const WARN_RATIO = 0.85;

export function fillInfo(state: ContextState, count: CountFn): FillInfo {
  const used = usedTokens(state, count);
  const reserved = state.reservedOutput;
  const window = state.model.contextWindow;
  const total = used + reserved;
  const ratio = window > 0 ? total / window : Number.POSITIVE_INFINITY;
  const status: FillStatus = total > window ? 'over' : ratio >= WARN_RATIO ? 'warn' : 'ok';
  return { used, reserved, window, ratio, status, overBy: Math.max(0, total - window) };
}

/** The simulated `400: prompt is too long` — input alone exceeds the window. */
export function promptTooLong(state: ContextState, count: CountFn): boolean {
  return usedTokens(state, count) > state.model.contextWindow;
}

// Immutable update helpers — sims and stores always derive fresh states.

export function addBlock(state: ContextState, block: ContextBlock): ContextState {
  return { ...state, blocks: [...state.blocks, block] };
}

export function removeBlock(state: ContextState, blockId: string): ContextState {
  return { ...state, blocks: state.blocks.filter((b) => b.id !== blockId) };
}

export function updateBlock(
  state: ContextState,
  blockId: string,
  patch: Partial<Omit<ContextBlock, 'id'>>,
): ContextState {
  return {
    ...state,
    blocks: state.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
  };
}

export function setModel(state: ContextState, model: ModelProfile): ContextState {
  return { ...state, model };
}

export function setReservedOutput(state: ContextState, reservedOutput: number): ContextState {
  return { ...state, reservedOutput };
}

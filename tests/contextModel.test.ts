import { describe, expect, it } from 'vitest';
import {
  addBlock,
  blockTokens,
  fillInfo,
  promptTooLong,
  removeBlock,
  segmentTotals,
  setModel,
  setReservedOutput,
  updateBlock,
  usedTokens,
  type ContextBlock,
  type ContextState,
  type CountFn,
} from '@/engine/contextModel';
import { getModelProfile } from '@/engine/modelProfiles';

/** Deterministic stand-in: 1 token per character. */
const countChars: CountFn = (text) => text.length;

function block(overrides: Partial<ContextBlock> & Pick<ContextBlock, 'id'>): ContextBlock {
  return { role: 'user', kind: 'message', ...overrides };
}

function state(blocks: ContextBlock[], reservedOutput = 0): ContextState {
  return { model: getModelProfile('generic-8k'), blocks, reservedOutput };
}

describe('blockTokens', () => {
  it('tokenizes live text', () => {
    expect(blockTokens(block({ id: 'a', text: 'hello' }), countChars)).toBe(5);
  });

  it('uses the authored count when there is no text', () => {
    expect(blockTokens(block({ id: 'a', fixedTokens: 90_000 }), countChars)).toBe(90_000);
  });

  it('prefers live text over an authored count', () => {
    expect(blockTokens(block({ id: 'a', text: 'hi', fixedTokens: 500 }), countChars)).toBe(2);
  });

  it('counts an empty block as zero', () => {
    expect(blockTokens(block({ id: 'a' }), countChars)).toBe(0);
  });
});

describe('usedTokens and segments', () => {
  const s = state([
    block({ id: 'sys', role: 'system', text: '123456789A' }), // 10
    block({ id: 'dev', role: 'developer', fixedTokens: 5 }),
    block({ id: 'cfg', role: 'system', kind: 'config-file', fixedTokens: 100 }),
    block({ id: 'file', role: 'user', kind: 'attachment', fixedTokens: 1000 }),
    block({ id: 'tool', role: 'tool', kind: 'tool-result', fixedTokens: 40 }),
    block({ id: 'u1', role: 'user', fixedTokens: 7 }),
    block({ id: 'a1', role: 'assistant', fixedTokens: 8 }),
  ]);

  it('sums every block', () => {
    expect(usedTokens(s, countChars)).toBe(10 + 5 + 100 + 1000 + 40 + 7 + 8);
  });

  it('maps blocks to fill-bar segments by kind, then role', () => {
    expect(segmentTotals({ ...s, reservedOutput: 64 }, countChars)).toEqual({
      system: 15,
      config: 100,
      files: 1000,
      tools: 40,
      history: 15,
      reservedOutput: 64,
    });
  });
});

describe('fillInfo', () => {
  it('reports ok well under the window', () => {
    const info = fillInfo(state([block({ id: 'a', fixedTokens: 1000 })]), countChars);
    expect(info.status).toBe('ok');
    expect(info.ratio).toBeCloseTo(0.125);
    expect(info.overBy).toBe(0);
  });

  it('warns as the window approaches (≥85%)', () => {
    const info = fillInfo(state([block({ id: 'a', fixedTokens: 6800 })]), countChars);
    expect(info.status).toBe('warn');
  });

  it('counts reserved output toward the budget', () => {
    const info = fillInfo(state([block({ id: 'a', fixedTokens: 6000 })], 2500), countChars);
    expect(info.status).toBe('over');
    expect(info.overBy).toBe(500);
  });

  it('flags prompt-too-long only when input alone exceeds the window', () => {
    const okInput = state([block({ id: 'a', fixedTokens: 6000 })], 2500);
    expect(promptTooLong(okInput, countChars)).toBe(false);
    const overInput = state([block({ id: 'a', fixedTokens: 8001 })]);
    expect(promptTooLong(overInput, countChars)).toBe(true);
  });
});

describe('immutable updates', () => {
  it('adds, updates and removes blocks without mutating the source state', () => {
    const original = state([block({ id: 'a', fixedTokens: 1 })]);
    const added = addBlock(original, block({ id: 'b', fixedTokens: 2 }));
    const updated = updateBlock(added, 'a', { fixedTokens: 9 });
    const removed = removeBlock(updated, 'b');

    expect(original.blocks).toHaveLength(1);
    expect(original.blocks[0]!.fixedTokens).toBe(1);
    expect(added.blocks).toHaveLength(2);
    expect(updated.blocks[0]!.fixedTokens).toBe(9);
    expect(removed.blocks.map((b) => b.id)).toEqual(['a']);
  });

  it('swaps the model and reserved output immutably', () => {
    const original = state([]);
    const bigger = setModel(original, getModelProfile('generic-1m'));
    const reserved = setReservedOutput(bigger, 4096);
    expect(original.model.id).toBe('generic-8k');
    expect(bigger.model.contextWindow).toBe(1_000_000);
    expect(reserved.reservedOutput).toBe(4096);
  });
});

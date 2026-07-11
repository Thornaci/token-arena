import { describe, expect, it } from 'vitest';

import {
  lookupPrerecorded,
  parseWorkerMessage,
  top1Drop,
  topKFromLogits,
  type Distribution,
  type PrerecordedFile,
} from '@/engine/indecision';

describe('topKFromLogits', () => {
  it('returns true softmax probabilities, most probable first', () => {
    const top = topKFromLogits([1, 3, 2], 3);
    expect(top.map((t) => t.id)).toEqual([1, 2, 0]);
    const total = top.reduce((sum, t) => sum + t.probability, 0);
    expect(total).toBeCloseTo(1, 10);
    // softmax([1,3,2]) top-1 = e^3 / (e^1 + e^2 + e^3)
    expect(top[0]!.probability).toBeCloseTo(
      Math.exp(3) / (Math.exp(1) + Math.exp(2) + Math.exp(3)),
      10,
    );
  });

  it('keeps only k entries and their probabilities reflect the full vocabulary', () => {
    const logits = [0, 0, 0, 10];
    const top = topKFromLogits(logits, 2);
    expect(top).toHaveLength(2);
    expect(top[0]!.id).toBe(3);
    // The tail is excluded from the list but not from the softmax denominator.
    const sum = top.reduce((s, t) => s + t.probability, 0);
    expect(sum).toBeLessThan(1);
  });

  it('is numerically stable for huge logits', () => {
    const top = topKFromLogits([1000, 999, 998], 2);
    expect(Number.isFinite(top[0]!.probability)).toBe(true);
    expect(top[0]!.id).toBe(0);
    expect(top[0]!.probability).toBeGreaterThan(top[1]!.probability);
  });

  it('handles k larger than the vocabulary and empty input', () => {
    expect(topKFromLogits([0.5, 0.1], 5)).toHaveLength(2);
    expect(topKFromLogits([], 3)).toEqual([]);
    expect(topKFromLogits([1, 2], 0)).toEqual([]);
  });

  it('selects the true top-k from an unsorted spread', () => {
    const logits = [3, -1, 7, 2, 7.5, 0];
    const top = topKFromLogits(logits, 3);
    expect(top.map((t) => t.id)).toEqual([4, 2, 0]);
  });
});

const dist = (prompt: string, probabilities: number[]): Distribution => ({
  prompt,
  candidates: probabilities.map((probability, i) => ({ token: `t${i}`, probability })),
});

describe('top1Drop', () => {
  it('reports the top-1 probability before and after the contradiction', () => {
    expect(top1Drop(dist('a', [0.93, 0.04]), dist('b', [0.41, 0.3]))).toEqual({
      from: 0.93,
      to: 0.41,
    });
  });

  it('treats empty candidate lists as zero', () => {
    expect(top1Drop(dist('a', []), dist('b', [0.5]))).toEqual({ from: 0, to: 0.5 });
  });
});

describe('parseWorkerMessage', () => {
  it('accepts every well-formed protocol message', () => {
    expect(parseWorkerMessage({ type: 'ready' })).toEqual({ type: 'ready' });
    expect(parseWorkerMessage({ type: 'progress', pct: 40, file: 'model.onnx' })).toEqual({
      type: 'progress',
      pct: 40,
      file: 'model.onnx',
    });
    const distribution = dist('The capital', [0.9]);
    expect(parseWorkerMessage({ type: 'result', requestId: 2, distribution })).toEqual({
      type: 'result',
      requestId: 2,
      distribution,
    });
    expect(parseWorkerMessage({ type: 'error', message: 'boom' })).toEqual({
      type: 'error',
      message: 'boom',
    });
    expect(parseWorkerMessage({ type: 'error', message: 'boom', requestId: 1 })).toEqual({
      type: 'error',
      message: 'boom',
      requestId: 1,
    });
  });

  it('rejects malformed messages instead of trusting the boundary', () => {
    expect(parseWorkerMessage(null)).toBeNull();
    expect(parseWorkerMessage('ready')).toBeNull();
    expect(parseWorkerMessage({ type: 'launch-missiles' })).toBeNull();
    expect(parseWorkerMessage({ type: 'progress', pct: '40', file: 'x' })).toBeNull();
    expect(parseWorkerMessage({ type: 'result', requestId: 1, distribution: { prompt: 'p' } })).toBeNull();
    expect(
      parseWorkerMessage({
        type: 'result',
        requestId: 1,
        distribution: { prompt: 'p', candidates: [{ token: 'x' }] },
      }),
    ).toBeNull();
    expect(parseWorkerMessage({ type: 'error' })).toBeNull();
  });
});

describe('lookupPrerecorded', () => {
  const file: PrerecordedFile = {
    modelRepo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q4',
    recordedAt: '2026-07-11T00:00:00Z',
    pairs: {
      capital: {
        base: dist('The capital of France is', [0.9, 0.02]),
        contradiction: dist('… no wait —', [0.4, 0.3]),
      },
    },
  };

  it('returns the recorded distribution in the exact worker shape', () => {
    const base = lookupPrerecorded(file, 'capital', 'base');
    expect(parseWorkerMessage({ type: 'result', requestId: 1, distribution: base })).not.toBeNull();
    expect(lookupPrerecorded(file, 'capital', 'contradiction').candidates[0]!.probability).toBe(0.4);
  });

  it('throws on unknown pair ids', () => {
    expect(() => lookupPrerecorded(file, 'nope', 'base')).toThrow(/no pair/);
  });
});

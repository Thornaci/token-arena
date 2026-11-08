import { describe, expect, it } from 'vitest';
import { cosine, nearest, optionMargin, pca2d, similarityMatrix } from '@/engine/embedMap';
import { finalAnswer, getScene, occlusionRanking, traceText, type ReplayFile } from '@/engine/replay';

describe('finalAnswer reads the committed answer, not any matching value', () => {
  it('takes the LAST number, so numbers restated from the question never count', () => {
    // The trap that motivated this helper: "all but 9" restated, then a wrong 8.
    const reply = 'A farmer has 17 sheep. All but **9** run away. 17 - 9 = 8. **Answer:** 8.';
    expect(finalAnswer(reply, 'number')).toBe('8');
    expect(finalAnswer('The letter "r" appears **3 times**. Answer: 3', 'number')).toBe('3');
    expect(finalAnswer('no digits here', 'number')).toBeNull();
  });

  it('takes the LAST yes/no word', () => {
    expect(finalAnswer('No. 91 is not a prime number because it is divisible by 7 and 13.', 'yesno')).toBe('no');
    expect(finalAnswer('You asked me to answer yes or no. 91 = 7 × 13, so: No.', 'yesno')).toBe('no');
    expect(finalAnswer('Yes, 91 is a prime number. **Answer: Yes**.', 'yesno')).toBe('yes');
    expect(finalAnswer('Nobody knows', 'yesno')).toBeNull();
  });
});

describe('replay helpers', () => {
  const file: ReplayFile = {
    recordedAt: '2026-11-06',
    dtype: 'q8',
    scenes: {
      t: {
        kind: 'trace',
        model: 'm',
        prompt: 'Once',
        chat: false,
        stopped: false,
        steps: [
          { top: [{ token: ' upon', probability: 0.9 }] },
          { top: [{ token: ' a', probability: 0.8 }] },
        ],
      },
      o: {
        kind: 'occlusion',
        model: 'm',
        prompt: 'a b c',
        answer: ' x',
        base: 0.9,
        words: [
          { word: 'a', probability: 0.85 },
          { word: 'b', probability: 0.1 },
          { word: 'c', probability: 0.5 },
        ],
      },
    },
  };

  it('traceText concatenates the chosen tokens up to a step', () => {
    const scene = getScene(file, 't', 'trace');
    expect(traceText(scene, 0)).toBe('');
    expect(traceText(scene, 2)).toBe(' upon a');
  });

  it('getScene refuses a missing or mistyped scene', () => {
    expect(() => getScene(file, 'nope', 'trace')).toThrow(/missing/);
    expect(() => getScene(file, 't', 'occlusion')).toThrow(/is a trace/);
  });

  it('occlusionRanking orders words by how much deleting them hurts', () => {
    const ranked = occlusionRanking(getScene(file, 'o', 'occlusion'));
    expect(ranked.map((r) => r.word)).toEqual(['b', 'c', 'a']);
    expect(ranked[0]!.drop).toBeCloseTo(0.8);
  });
});

describe('embedding map math', () => {
  const vectors = [
    [1, 0, 0],
    [0.9, 0.1, 0],
    [0, 1, 0],
    [0, 0.95, 0.05],
  ];

  it('cosine is 1 for identical directions and 0 for orthogonal ones', () => {
    expect(cosine([1, 2], [2, 4])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('nearest skips the word itself', () => {
    const sim = similarityMatrix(vectors);
    expect(nearest(sim, 0, 1)).toEqual([1]);
    expect(nearest(sim, 2, 2)[0]).toBe(3);
  });

  it('pca2d is deterministic, scaled to [0,1], and keeps clusters apart', () => {
    const a = pca2d(vectors);
    expect(pca2d(vectors)).toEqual(a);
    for (const [x, y] of a) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    const dist = (i: number, j: number) => Math.hypot(a[i]![0] - a[j]![0], a[i]![1] - a[j]![1]);
    expect(dist(0, 1)).toBeLessThan(dist(0, 2));
  });

  it('optionMargin picks the most similar option and reports the gap', () => {
    const file = {
      words: ['a', 'b', 'c'].map((text) => ({ text, concept: text, lang: 'en' })),
      sim: [
        [1, 0.9, 0.5],
        [0.9, 1, 0.4],
        [0.5, 0.4, 1],
      ],
    };
    expect(optionMargin(file, 'a', ['c', 'b'])).toEqual({ best: 'b', margin: expect.closeTo(0.4) });
    expect(() => optionMargin(file, 'a', ['zzz'])).toThrow(/not on the map/);
  });
});

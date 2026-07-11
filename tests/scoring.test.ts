import { describe, expect, it } from 'vitest';
import { evaluate, isSingleWord } from '@/engine/scoring';

describe('tokenTarget', () => {
  it('passes at or under an lte target', () => {
    expect(evaluate({ type: 'tokenTarget', comparator: 'lte', target: 12 }, { type: 'tokenCount', tokens: 12 }).pass).toBe(true);
    expect(evaluate({ type: 'tokenTarget', comparator: 'lte', target: 12 }, { type: 'tokenCount', tokens: 13 }).pass).toBe(false);
  });

  it('passes at or over a gte target', () => {
    expect(evaluate({ type: 'tokenTarget', comparator: 'gte', target: 5 }, { type: 'tokenCount', tokens: 5 }).pass).toBe(true);
    expect(evaluate({ type: 'tokenTarget', comparator: 'gte', target: 5 }, { type: 'tokenCount', tokens: 4 }).pass).toBe(false);
  });
});

describe('multiTokenWord', () => {
  const check = { type: 'multiTokenWord', minTokens: 5 } as const;

  it('accepts a single word with enough tokens', () => {
    expect(evaluate(check, { type: 'word', word: 'anticonstitutionnellement', tokens: 7 }).pass).toBe(true);
    expect(evaluate(check, { type: 'word', word: 'gülümseyişlerinden', tokens: 6 }).pass).toBe(true);
  });

  it('rejects too few tokens or anything that is not one word', () => {
    expect(evaluate(check, { type: 'word', word: 'hello', tokens: 1 }).pass).toBe(false);
    expect(evaluate(check, { type: 'word', word: 'two words', tokens: 9 }).pass).toBe(false);
    expect(evaluate(check, { type: 'word', word: 'a1b2c3', tokens: 6 }).pass).toBe(false);
  });

  it('defines a word as letters, marks, hyphens and apostrophes in any script', () => {
    expect(isSingleWord("İstanbul'da")).toBe(true);
    expect(isSingleWord('well-known')).toBe(true);
    expect(isSingleWord('emoji🚀word')).toBe(false);
    expect(isSingleWord('')).toBe(false);
  });
});

describe('choice', () => {
  it('passes only the correct option', () => {
    expect(evaluate({ type: 'choice', correctIndex: 2 }, { type: 'choice', selectedIndex: 2 }).pass).toBe(true);
    expect(evaluate({ type: 'choice', correctIndex: 2 }, { type: 'choice', selectedIndex: 0 }).pass).toBe(false);
  });
});

describe('choiceRounds', () => {
  const check = { type: 'choiceRounds', correctIndexes: [0, 1, 1, 0], minCorrect: 3 } as const;

  it('counts correct rounds and applies the threshold', () => {
    const result = evaluate(check, { type: 'choices', selectedIndexes: [0, 1, 0, 0] });
    expect(result).toEqual({ pass: true, correctCount: 3 });
    expect(evaluate(check, { type: 'choices', selectedIndexes: [1, 0, 0, 1] }).pass).toBe(false);
  });

  it('treats missing answers as wrong', () => {
    const result = evaluate(check, { type: 'choices', selectedIndexes: [0, 1] });
    expect(result).toEqual({ pass: false, correctCount: 2 });
  });
});

describe('budgetFit', () => {
  const check = { type: 'budgetFit', budget: 8000 } as const;

  it('passes only under budget with every required piece kept', () => {
    expect(evaluate(check, { type: 'budgetFit', totalTokens: 8000, requiredKept: true }).pass).toBe(true);
    expect(evaluate(check, { type: 'budgetFit', totalTokens: 8001, requiredKept: true }).pass).toBe(false);
  });

  it('fails when a required piece was dropped, even under budget', () => {
    expect(evaluate(check, { type: 'budgetFit', totalTokens: 500, requiredKept: false }).pass).toBe(false);
  });
});

describe('choiceOneOf', () => {
  const check = { type: 'choiceOneOf', validIndexes: [0, 4] } as const;

  it('accepts any valid index and rejects the rest', () => {
    expect(evaluate(check, { type: 'choice', selectedIndex: 0 }).pass).toBe(true);
    expect(evaluate(check, { type: 'choice', selectedIndex: 4 }).pass).toBe(true);
    expect(evaluate(check, { type: 'choice', selectedIndex: 2 }).pass).toBe(false);
  });
});

describe('ordering', () => {
  const check = { type: 'ordering', size: 4 } as const;

  it('passes only the exact canonical order', () => {
    expect(evaluate(check, { type: 'ordering', order: [0, 1, 2, 3] }).pass).toBe(true);
    expect(evaluate(check, { type: 'ordering', order: [0, 2, 1, 3] }).pass).toBe(false);
  });

  it('rejects wrong lengths', () => {
    expect(evaluate(check, { type: 'ordering', order: [0, 1, 2] }).pass).toBe(false);
    expect(evaluate(check, { type: 'ordering', order: [0, 1, 2, 3, 4] }).pass).toBe(false);
  });
});

describe('tradeoff', () => {
  it('passes when the predicted downside matches the chosen strategy', () => {
    expect(evaluate({ type: 'tradeoff' }, { type: 'tradeoff', predictedIndex: 1, correctIndex: 1 }).pass).toBe(true);
    expect(evaluate({ type: 'tradeoff' }, { type: 'tradeoff', predictedIndex: 0, correctIndex: 1 }).pass).toBe(false);
  });
});

describe('evidence mismatch', () => {
  it('throws loudly when a mechanic sends the wrong evidence shape', () => {
    expect(() =>
      evaluate({ type: 'choice', correctIndex: 0 }, { type: 'tokenCount', tokens: 3 }),
    ).toThrow(/does not fit/);
  });
});

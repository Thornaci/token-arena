/**
 * Pass/fail checks are data: lessons declare a check, mechanics collect
 * evidence, and `evaluate` decides. Every check is deterministic.
 */
export type PassCheck =
  /** Reach a token-count target (e.g. "make this cost ≤ 12 tokens"). */
  | { type: 'tokenTarget'; comparator: 'lte' | 'gte'; target: number }
  /** Find a single word that tokenizes into at least `minTokens` tokens. */
  | { type: 'multiTokenWord'; minTokens: number }
  /** One multiple-choice question. */
  | { type: 'choice'; correctIndex: number }
  /** Several prediction rounds; pass when at least `minCorrect` are right. */
  | { type: 'choiceRounds'; correctIndexes: readonly number[]; minCorrect: number }
  /** Finish all `count` sub-challenges of a level. */
  | { type: 'completeAll'; count: number };

export type Evidence =
  | { type: 'tokenCount'; tokens: number }
  | { type: 'word'; word: string; tokens: number }
  | { type: 'choice'; selectedIndex: number }
  | { type: 'choices'; selectedIndexes: readonly number[] }
  | { type: 'counter'; completed: number };

export interface ScoreResult {
  pass: boolean;
  /** For round-based checks: how many rounds were answered correctly. */
  correctCount?: number;
}

/** A "word" here is one whitespace-free run of letters (any script), marks, hyphens or apostrophes. */
const WORD_PATTERN = /^[\p{L}\p{M}'’-]+$/u;

export function isSingleWord(value: string): boolean {
  return WORD_PATTERN.test(value);
}

export function evaluate(check: PassCheck, evidence: Evidence): ScoreResult {
  switch (check.type) {
    case 'tokenTarget': {
      if (evidence.type !== 'tokenCount') return mismatch(check, evidence);
      const pass =
        check.comparator === 'lte'
          ? evidence.tokens <= check.target
          : evidence.tokens >= check.target;
      return { pass };
    }
    case 'multiTokenWord': {
      if (evidence.type !== 'word') return mismatch(check, evidence);
      return { pass: isSingleWord(evidence.word) && evidence.tokens >= check.minTokens };
    }
    case 'choice': {
      if (evidence.type !== 'choice') return mismatch(check, evidence);
      return { pass: evidence.selectedIndex === check.correctIndex };
    }
    case 'choiceRounds': {
      if (evidence.type !== 'choices') return mismatch(check, evidence);
      const correctCount = check.correctIndexes.reduce(
        (sum, correct, round) =>
          sum + (evidence.selectedIndexes[round] === correct ? 1 : 0),
        0,
      );
      return { pass: correctCount >= check.minCorrect, correctCount };
    }
    case 'completeAll': {
      if (evidence.type !== 'counter') return mismatch(check, evidence);
      return { pass: evidence.completed >= check.count, correctCount: evidence.completed };
    }
  }
}

function mismatch(check: PassCheck, evidence: Evidence): never {
  throw new Error(
    `Evidence type "${evidence.type}" does not fit check type "${check.type}" — mechanic and lesson data disagree`,
  );
}

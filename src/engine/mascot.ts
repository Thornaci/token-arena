/**
 * "The Model" mascot — pure state machine + Confusion Meter (spec §2).
 *
 * No DOM, no timers, no randomness: mascot state and meter value are pure
 * functions of sim-derived inputs, unit-testable without rendering. The
 * store layer (src/stores/mascot.ts) owns transient timing (celebration
 * pulses etc.); this module only maps inputs → view.
 */

export type MascotState =
  | 'neutral'
  | 'focused'
  | 'confused'
  | 'overwhelmed'
  | 'overflow'
  | 'foggy'
  | 'forgetful'
  | 'uncertain'
  | 'confident';

export interface MascotInputs {
  /** fillInfo().ratio of the current context; 0 when no context is shown. */
  fillRatio: number;
  /** Simulated `400: prompt is too long`. */
  overflow: boolean;
  /** Contradictory instruction pairs currently on screen. */
  conflictCount: number;
  /** Untrusted content is being treated as instructions. */
  injectionActive: boolean;
  /** Recall % of the last probed needle spot (needle lessons), else null. */
  needleRecallPct: number | null;
  /** normalizedEntropy() of the distribution on screen, else null. */
  entropyNorm: number | null;
  /** Post-compaction state. */
  compacted: boolean;
  /** A send/retrieval is in flight. */
  processing: boolean;
  lastRetrieval: 'hit' | 'miss' | null;
  /** Level-pass pulse (the store clears it after a short beat). */
  celebrating: boolean;
}

export const IDLE_INPUTS: MascotInputs = {
  fillRatio: 0,
  overflow: false,
  conflictCount: 0,
  injectionActive: false,
  needleRecallPct: null,
  entropyNorm: null,
  compacted: false,
  processing: false,
  lastRetrieval: null,
  celebrating: false,
};

export interface Contributor {
  key: string;
  points: number;
  params?: Record<string, number>;
}

export interface MascotView {
  state: MascotState;
  /** 0–100 */
  confusion: number;
  /** Deterministic, fixed-order teaching list ("+30: two instructions contradict"). */
  contributors: Contributor[];
}

/** Same threshold semantics as contextModel's WARN_RATIO. */
export const OVERWHELMED_RATIO = 0.85;
export const UNCERTAIN_ENTROPY = 0.72;
export const CONFIDENT_ENTROPY = 0.35;
export const FOGGY_RECALL_PCT = 60;

/**
 * Shannon entropy normalized to [0, 1] by ln(k). Accepts both full
 * distributions (L6.1 in-nucleus probabilities) and honest top-k lists that
 * deliberately don't sum to 1 (L6.2): zero entries are dropped and the rest
 * renormalized. Returns null for an empty list, 0 for a single candidate.
 */
export function normalizedEntropy(probabilities: readonly number[]): number | null {
  const positive = probabilities.filter((p) => p > 0);
  if (positive.length === 0) return null;
  if (positive.length === 1) return 0;
  const total = positive.reduce((sum, p) => sum + p, 0);
  let entropy = 0;
  for (const p of positive) {
    const q = p / total;
    entropy -= q * Math.log(q);
  }
  return entropy / Math.log(positive.length);
}

/** First match wins — this exact order is locked by tests/mascot.test.ts. */
function pickState(inputs: MascotInputs): MascotState {
  if (inputs.overflow) return 'overflow';
  if (inputs.celebrating) return 'confident';
  if (inputs.compacted) return 'forgetful';
  if (inputs.conflictCount > 0 || inputs.injectionActive) return 'confused';
  if (inputs.fillRatio >= OVERWHELMED_RATIO) return 'overwhelmed';
  if (
    inputs.lastRetrieval === 'miss' ||
    (inputs.processing && inputs.needleRecallPct !== null && inputs.needleRecallPct < FOGGY_RECALL_PCT)
  ) {
    return 'foggy';
  }
  if (inputs.entropyNorm !== null && inputs.entropyNorm >= UNCERTAIN_ENTROPY) return 'uncertain';
  if (
    inputs.lastRetrieval === 'hit' ||
    (inputs.entropyNorm !== null && inputs.entropyNorm <= CONFIDENT_ENTROPY)
  ) {
    return 'confident';
  }
  if (inputs.processing) return 'focused';
  return 'neutral';
}

function computeContributors(inputs: MascotInputs): Contributor[] {
  const contributors: Contributor[] = [];
  if (inputs.conflictCount > 0) {
    contributors.push({
      key: 'mascot_contrib_conflicts',
      points: Math.min(inputs.conflictCount, 2) * 30,
      params: { count: inputs.conflictCount },
    });
  }
  if (inputs.injectionActive) {
    contributors.push({ key: 'mascot_contrib_injection', points: 15 });
  }
  if (inputs.overflow) {
    contributors.push({ key: 'mascot_contrib_overflow', points: 40 });
  } else if (inputs.fillRatio >= OVERWHELMED_RATIO) {
    contributors.push({
      key: 'mascot_contrib_fill',
      points: 20,
      params: { pct: Math.round(inputs.fillRatio * 100) },
    });
  } else if (inputs.fillRatio >= 0.7) {
    contributors.push({
      key: 'mascot_contrib_fill',
      points: 10,
      params: { pct: Math.round(inputs.fillRatio * 100) },
    });
  }
  if (inputs.needleRecallPct !== null && inputs.needleRecallPct < FOGGY_RECALL_PCT) {
    contributors.push({
      key: 'mascot_contrib_needle',
      points: 20,
      params: { pct: Math.round(inputs.needleRecallPct) },
    });
  }
  if (inputs.entropyNorm !== null && inputs.entropyNorm >= 0.5) {
    contributors.push({
      key: 'mascot_contrib_entropy',
      points: Math.round(inputs.entropyNorm * 30),
    });
  }
  if (inputs.compacted) {
    contributors.push({ key: 'mascot_contrib_compacted', points: 10 });
  }
  return contributors;
}

export function computeMascotState(inputs: MascotInputs): MascotView {
  const contributors = computeContributors(inputs);
  const total = contributors.reduce((sum, c) => sum + c.points, 0);
  return {
    state: pickState(inputs),
    confusion: Math.max(0, Math.min(100, total)),
    contributors,
  };
}

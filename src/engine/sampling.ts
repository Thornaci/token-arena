/**
 * Sampling math for the pre-recorded distribution lab (L6.1). Lessons author
 * a fixed top-k list of candidate tokens with logits; temperature and top-p
 * are applied with the real formulas, so sliders behave exactly like the
 * genuine article — deterministically and without a model.
 */

export interface Candidate {
  /** Literal token text — identical across locales so lessons stay deterministic. */
  token: string;
  logit: number;
}

export interface WeightedCandidate extends Candidate {
  /** Probability after temperature scaling, normalized over the authored top-k. */
  probability: number;
  /** False when top-p truncation removed this candidate from the pool. */
  inNucleus: boolean;
}

/** softmax(logit / temperature) over the candidate list. */
export function applyTemperature(
  candidates: readonly Candidate[],
  temperature: number,
): WeightedCandidate[] {
  if (temperature <= 0) throw new Error(`temperature must be > 0, got ${temperature}`);
  // Subtract the max before exponentiating for numerical stability.
  const scaled = candidates.map((c) => c.logit / temperature);
  const max = Math.max(...scaled);
  const weights = scaled.map((s) => Math.exp(s - max));
  const total = weights.reduce((sum, w) => sum + w, 0);
  return candidates.map((c, i) => ({
    ...c,
    probability: weights[i]! / total,
    inNucleus: true,
  }));
}

/**
 * Nucleus (top-p) truncation: keep the smallest probability-sorted prefix
 * whose cumulative probability reaches `topP`; everything else is cut.
 * Probabilities are NOT renormalized — the lab shows the cut visually.
 */
export function applyTopP(
  candidates: readonly WeightedCandidate[],
  topP: number,
): WeightedCandidate[] {
  if (topP <= 0 || topP > 1) throw new Error(`topP must be in (0, 1], got ${topP}`);
  const byProbability = [...candidates].sort((a, b) => b.probability - a.probability);
  const nucleus = new Set<string>();
  let cumulative = 0;
  for (const candidate of byProbability) {
    nucleus.add(candidate.token);
    cumulative += candidate.probability;
    if (cumulative >= topP) break;
  }
  return candidates.map((c) => ({ ...c, inNucleus: nucleus.has(c.token) }));
}

/** Temperature then top-p — the order real samplers apply them in. */
export function sampleDistribution(
  candidates: readonly Candidate[],
  temperature: number,
  topP: number,
): WeightedCandidate[] {
  return applyTopP(applyTemperature(candidates, temperature), topP);
}

/** The candidate a greedy (argmax) decode would pick. */
export function topCandidate(candidates: readonly WeightedCandidate[]): WeightedCandidate {
  if (candidates.length === 0) throw new Error('empty candidate list');
  return candidates.reduce((best, c) => (c.probability > best.probability ? c : best));
}

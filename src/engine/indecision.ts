/**
 * L6.2 "The model's indecision" — the pure half of the real-model path.
 *
 * The WebGPU worker (src/workers/indecision.worker.ts) is a thin shell around
 * these functions; everything numeric or protocol-shaped lives here so it can
 * be unit-tested in Node, where WebGPU does not exist. This module must never
 * import @huggingface/transformers — that dependency belongs to the worker
 * chunk alone, so the main bundle stays lean.
 */

/** One next-token candidate with its true softmax probability. */
export interface TopKCandidate {
  token: string;
  probability: number;
}

/**
 * The canonical shape shared by the live worker and the pre-recorded
 * fallback: top-k of a full-vocabulary softmax. Probabilities deliberately do
 * NOT sum to 1 — the invisible tail is the honest part.
 */
export interface Distribution {
  prompt: string;
  candidates: TopKCandidate[];
}

/**
 * Full-vocabulary softmax (max-subtracted for numerical stability), then the
 * k most probable entries, most probable first.
 */
export function topKFromLogits(
  logits: ArrayLike<number>,
  k: number,
): { id: number; probability: number }[] {
  const n = logits.length;
  if (n === 0 || k <= 0) return [];
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const value = logits[i]!;
    if (value > max) max = value;
  }
  let sum = 0;
  const exps = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const e = Math.exp(logits[i]! - max);
    exps[i] = e;
    sum += e;
  }
  // Partial selection: keep the k best seen so far (k is tiny, vocab is not).
  const top: { id: number; probability: number }[] = [];
  for (let i = 0; i < n; i++) {
    const probability = exps[i]! / sum;
    if (top.length < k) {
      top.push({ id: i, probability });
      if (top.length === k) top.sort((a, b) => b.probability - a.probability);
      continue;
    }
    if (probability > top[top.length - 1]!.probability) {
      top[top.length - 1] = { id: i, probability };
      top.sort((a, b) => b.probability - a.probability);
    }
  }
  if (top.length < k) top.sort((a, b) => b.probability - a.probability);
  return top;
}

/** The lesson's verdict line: how far the top-1 probability fell. */
export function top1Drop(
  base: Distribution,
  contradiction: Distribution,
): { from: number; to: number } {
  return {
    from: base.candidates[0]?.probability ?? 0,
    to: contradiction.candidates[0]?.probability ?? 0,
  };
}

// --- Worker protocol ---------------------------------------------------------

export interface InitRequest {
  type: 'init';
  modelRepo: string;
  dtype: 'q4' | 'q4f16';
  topK: number;
}

export interface InferRequest {
  type: 'infer';
  requestId: number;
  prompt: string;
}

export type WorkerRequest = InitRequest | InferRequest;

export type WorkerResponse =
  | { type: 'progress'; pct: number; file: string }
  | { type: 'ready' }
  | { type: 'result'; requestId: number; distribution: Distribution }
  | { type: 'error'; requestId?: number; message: string };

function isDistribution(value: unknown): value is Distribution {
  if (typeof value !== 'object' || value === null) return false;
  const dist = value as Record<string, unknown>;
  return (
    typeof dist.prompt === 'string' &&
    Array.isArray(dist.candidates) &&
    dist.candidates.every(
      (c: unknown) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Record<string, unknown>).token === 'string' &&
        typeof (c as Record<string, unknown>).probability === 'number',
    )
  );
}

/** Guards messages crossing the worker boundary; null for anything malformed. */
export function parseWorkerMessage(data: unknown): WorkerResponse | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case 'progress':
      return typeof msg.pct === 'number' && typeof msg.file === 'string'
        ? { type: 'progress', pct: msg.pct, file: msg.file }
        : null;
    case 'ready':
      return { type: 'ready' };
    case 'result':
      return typeof msg.requestId === 'number' && isDistribution(msg.distribution)
        ? { type: 'result', requestId: msg.requestId, distribution: msg.distribution }
        : null;
    case 'error':
      return typeof msg.message === 'string'
        ? {
            type: 'error',
            message: msg.message,
            ...(typeof msg.requestId === 'number' ? { requestId: msg.requestId } : {}),
          }
        : null;
    default:
      return null;
  }
}

// --- Pre-recorded fallback ----------------------------------------------------

/** A recorded base/contradiction run for one authored pair. */
export interface PrerecordedPair {
  base: Distribution;
  contradiction: Distribution;
}

/**
 * Shape of public/prerecorded/l6-2.json, produced by scripts/record-l6-2.mjs
 * with the exact forward pass the worker uses. modelRepo/dtype are recorded so
 * tests can detect drift between the lesson params and the recording.
 */
export interface PrerecordedFile {
  modelRepo: string;
  dtype: string;
  recordedAt: string;
  pairs: Record<string, PrerecordedPair>;
}

export function lookupPrerecorded(
  file: PrerecordedFile,
  pairId: string,
  which: 'base' | 'contradiction',
): Distribution {
  const pair = file.pairs[pairId];
  if (!pair) throw new Error(`prerecorded file has no pair "${pairId}"`);
  return pair[which];
}

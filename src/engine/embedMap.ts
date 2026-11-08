/**
 * The meaning map (L12.2): words as embedding vectors. Pure math shared by the
 * recording script (which turns real model vectors into the shipped file) and
 * the tests (which lock lesson answers to that file). Relative imports only —
 * scripts/record.mjs imports this file straight from Node.
 */

export interface MapWord {
  /** Literal word, identical in every locale. */
  text: string;
  /** Internal concept id — words sharing it are translations of each other. */
  concept: string;
  lang: string;
}

/** What ships in public/prerecorded: never the raw 768-d vectors. */
export interface MeaningMapFile {
  model: string;
  dtype: string;
  prefix: string;
  /** Length of each embedding vector. */
  dims: number;
  recordedAt: string;
  words: MapWord[];
  /** 2-D layout from the first two principal components, scaled to [0, 1]. */
  xy: [number, number][];
  /** Full-dimension cosine similarity, words × words (symmetric, diagonal 1). */
  sim: number[][];
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return dot / Math.sqrt(na * nb);
}

export function similarityMatrix(vectors: ArrayLike<number>[]): number[][] {
  return vectors.map((a) => vectors.map((b) => cosine(a, b)));
}

/** Indexes of the k most similar other words, most similar first. */
export function nearest(sim: number[][], index: number, k: number): number[] {
  return sim[index]!
    .map((score, j) => ({ score, j }))
    .filter(({ j }) => j !== index)
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map(({ j }) => j);
}

/**
 * Projects vectors onto their first two principal components (power iteration
 * with deflation), then scales each axis to [0, 1]. Deterministic: fixed start
 * vector, and each axis is flipped so its largest loading is positive.
 */
export function pca2d(vectors: ArrayLike<number>[], iterations = 300): [number, number][] {
  const n = vectors.length;
  const d = vectors[0]!.length;
  const mean = new Float64Array(d);
  for (const v of vectors) for (let k = 0; k < d; k++) mean[k]! += v[k]! / n;
  const centered = vectors.map((v) => Float64Array.from({ length: d }, (_, k) => v[k]! - mean[k]!));

  const components: Float64Array[] = [];
  for (let c = 0; c < 2; c++) {
    let w = Float64Array.from({ length: d }, (_, k) => Math.sin(k + 1 + c * 7));
    for (let it = 0; it < iterations; it++) {
      const next = new Float64Array(d);
      for (const row of centered) {
        let s = 0;
        for (let k = 0; k < d; k++) s += row[k]! * w[k]!;
        for (let k = 0; k < d; k++) next[k]! += row[k]! * s;
      }
      for (const prev of components) {
        let dot = 0;
        for (let k = 0; k < d; k++) dot += next[k]! * prev[k]!;
        for (let k = 0; k < d; k++) next[k]! -= dot * prev[k]!;
      }
      let norm = 0;
      for (let k = 0; k < d; k++) norm += next[k]! * next[k]!;
      norm = Math.sqrt(norm);
      w = next.map((x) => x / norm);
    }
    let biggest = 0;
    for (let k = 0; k < d; k++) if (Math.abs(w[k]!) > Math.abs(w[biggest]!)) biggest = k;
    if (w[biggest]! < 0) w = w.map((x) => -x);
    components.push(w);
  }

  const projected = centered.map((row) =>
    components.map((w) => {
      let s = 0;
      for (let k = 0; k < d; k++) s += row[k]! * w[k]!;
      return s;
    }),
  );
  const scaled = [0, 1].map((axis) => {
    const values = projected.map((p) => p[axis]!);
    const min = Math.min(...values);
    const span = Math.max(...values) - min || 1;
    return values.map((v) => (v - min) / span);
  });
  return projected.map((_, i) => [scaled[0]![i]!, scaled[1]![i]!]);
}

/** How far the best option beats the runner-up, by similarity to the target. */
export function optionMargin(
  file: Pick<MeaningMapFile, 'words' | 'sim'>,
  target: string,
  options: readonly string[],
): { best: string; margin: number } {
  const indexOf = (text: string) => {
    const i = file.words.findIndex((w) => w.text === text);
    if (i === -1) throw new Error(`word "${text}" is not on the map`);
    return i;
  };
  const t = indexOf(target);
  const scored = options
    .map((text) => ({ text, score: file.sim[t]![indexOf(text)]! }))
    .sort((a, b) => b.score - a.score);
  return { best: scored[0]!.text, margin: scored[0]!.score - (scored[1]?.score ?? -1) };
}

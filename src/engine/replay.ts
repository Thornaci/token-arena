/**
 * Recorded real-model behaviour for the model-replay mechanic (L12.x, L13.x,
 * L14.1). scripts/record.mjs runs small open models in Node and writes these
 * shapes to public/prerecorded/; the lesson only ever replays them. Every
 * scene carries the exact inputs it was recorded from, so tests can lock the
 * file to the lesson's authored scene specs (re-record on any change).
 *
 * Relative imports only — scripts/record.mjs imports this file from Node.
 */

export interface Candidate {
  token: string;
  probability: number;
}

/** Greedy generation, one step at a time: the chosen token is always top[0]. */
export interface TraceScene {
  kind: 'trace';
  model: string;
  prompt: string;
  chat: boolean;
  steps: { top: Candidate[] }[];
  /** True when the last chosen token is the model's end-of-reply token. */
  stopped: boolean;
}

/** One or two next-token distributions, side by side. */
export interface NextScene {
  kind: 'next';
  model: string;
  items: {
    prompt: string;
    chat: boolean;
    top: Candidate[];
    /** Probability of the first token of each watched word, even outside the top-k. */
    watch: Record<string, number>;
  }[];
}

/** Greedy continuations of the same request by different models. */
export interface ContinueScene {
  kind: 'continue';
  items: { model: string; prompt: string; chat: boolean; text: string }[];
}

/** Leave-one-word-out: P(answer) after deleting each word of the prompt. */
export interface OcclusionScene {
  kind: 'occlusion';
  model: string;
  prompt: string;
  answer: string;
  base: number;
  words: { word: string; probability: number }[];
}

/** Greedy chat replies to several prompts. */
export interface AnswersScene {
  kind: 'answers';
  model: string;
  items: { prompt: string; text: string }[];
}

/** The same question asked with thinking on and off, once per seed. */
export interface ThinkingScene {
  kind: 'thinking';
  model: string;
  question: string;
  /** How the tokenizer split the question — the model never sees letters. */
  questionTokens: string[];
  settings: { thinkingTemperature: number; plainTemperature: number; topK: number };
  runs: {
    thinking: boolean;
    seed: number;
    /** Tokens strictly between <think> and </think>. */
    thinkTokens: number;
    answerTokens: number;
    thought: string;
    answer: string;
  }[];
}

export type RecordedScene =
  | TraceScene
  | NextScene
  | ContinueScene
  | OcclusionScene
  | AnswersScene
  | ThinkingScene;

export interface ReplayFile {
  recordedAt: string;
  dtype: string;
  scenes: Record<string, RecordedScene>;
}

export function getScene<K extends RecordedScene['kind']>(
  file: ReplayFile,
  id: string,
  kind: K,
): Extract<RecordedScene, { kind: K }> {
  const scene = file.scenes[id];
  if (!scene) throw new Error(`scene "${id}" is missing from the recording`);
  if (scene.kind !== kind) throw new Error(`scene "${id}" is a ${scene.kind}, expected ${kind}`);
  return scene as Extract<RecordedScene, { kind: K }>;
}

/** The text a trace has written after `upTo` steps (exclusive). */
export function traceText(scene: TraceScene, upTo: number): string {
  return scene.steps
    .slice(0, upTo)
    .map((step) => step.top[0]!.token)
    .join('');
}

/**
 * The answer a reply commits to, read from its END — never "does the
 * expected value appear anywhere": replies restate the question, and a
 * number from the question would score a wrong answer as right.
 *  - number: the last integer in the reply
 *  - yesno: the last standalone yes/no word ("Answer yes or no" restated
 *    up front must not count as a verdict)
 */
export function finalAnswer(text: string, kind: 'number' | 'yesno'): string | null {
  const matches = kind === 'number' ? text.match(/\d+/g) : text.toLowerCase().match(/\b(?:yes|no)\b/g);
  return matches ? matches[matches.length - 1]! : null;
}

/** Words ranked by how much deleting them lowers P(answer), biggest drop first. */
export function occlusionRanking(scene: OcclusionScene): { word: string; index: number; drop: number }[] {
  return scene.words
    .map((w, index) => ({ word: w.word, index, drop: scene.base - w.probability }))
    .sort((a, b) => b.drop - a.drop);
}

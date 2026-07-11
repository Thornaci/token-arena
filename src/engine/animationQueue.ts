/**
 * Deterministic animation beat queue (spec §6.3).
 *
 * The sim/engine always computes final state instantly BEFORE beats are
 * enqueued — this queue only replays presentation. Nothing gameplay-relevant
 * may depend on delivery timing.
 *
 * Reduced motion is correct by construction: a queue created with
 * `reduced: true` delivers every beat synchronously (`instant: true`), so
 * there is no code path where a reduced-motion user waits for animation.
 *
 * No clocks of its own — the scheduler is injectable so tests drive time.
 */

export interface AnimationBeat<P = unknown> {
  /** Unique per enqueue; scenes use it as a React key / dedupe handle. */
  id: string;
  /** e.g. 'block-land', 'rupture', 'beam-sweep' — scenes switch on this. */
  kind: string;
  payload?: P;
  /** Delivery of the NEXT beat waits this long. 0 is allowed. */
  durationMs: number;
  /**
   * Cinematics (rupture, retrieval sweep, press) may exceed the 400ms input
   * rule — but only ever enqueued alongside a visible Skip affordance.
   */
  cinematic?: boolean;
}

export interface BeatDelivery {
  beat: AnimationBeat;
  /** true when delivered by flush/skip/reduced mode — render final state. */
  instant: boolean;
}

export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface AnimationQueue {
  enqueue(beats: AnimationBeat | AnimationBeat[]): void;
  /** Deliver ALL pending beats synchronously, in order, as instant. */
  flush(): void;
  /** User-facing flush — identical semantics, kept distinct for intent. */
  skip(): void;
  /** Drop pending beats without delivering (lesson reset). */
  clear(): void;
  subscribe(listener: (delivery: BeatDelivery) => void): () => void;
  /** Notified whenever the queue drains to idle. */
  subscribeIdle(listener: () => void): () => void;
  /** Upper bound on remaining presentation time (drives Skip visibility). */
  pendingMs(): number;
  isIdle(): boolean;
}

const defaultScheduler: Scheduler = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

export const INPUT_BLOCK_LIMIT_MS = 400;

export function createAnimationQueue(options: {
  reduced: boolean;
  schedule?: Scheduler;
}): AnimationQueue {
  const schedule = options.schedule ?? defaultScheduler;
  const listeners = new Set<(delivery: BeatDelivery) => void>();
  const idleListeners = new Set<() => void>();
  const queue: AnimationBeat[] = [];
  let cancelTimer: (() => void) | null = null;
  let waitingMs = 0;
  let flushing = false;

  const deliver = (beat: AnimationBeat, instant: boolean) => {
    for (const listener of [...listeners]) listener({ beat, instant });
  };

  const notifyIdle = () => {
    for (const listener of [...idleListeners]) listener();
  };

  const assertBeat = (beat: AnimationBeat) => {
    if (import.meta.env.DEV && !beat.cinematic && beat.durationMs > INPUT_BLOCK_LIMIT_MS) {
      throw new Error(
        `animation beat "${beat.kind}" (${beat.durationMs}ms) exceeds the ${INPUT_BLOCK_LIMIT_MS}ms input rule — ` +
          'mark it cinematic and pair it with a Skip affordance',
      );
    }
  };

  const pump = () => {
    cancelTimer = null;
    waitingMs = 0;
    const beat = queue.shift();
    if (!beat) {
      notifyIdle();
      return;
    }
    deliver(beat, false);
    waitingMs = beat.durationMs;
    cancelTimer = schedule(pump, beat.durationMs);
  };

  const flush = () => {
    if (cancelTimer) {
      cancelTimer();
      cancelTimer = null;
    }
    waitingMs = 0;
    if (flushing) return;
    flushing = true;
    const hadWork = queue.length > 0;
    // drain loop: beats enqueued BY a delivery also flush
    while (queue.length > 0) deliver(queue.shift()!, true);
    flushing = false;
    if (hadWork) notifyIdle();
  };

  return {
    enqueue(beats) {
      const list = Array.isArray(beats) ? beats : [beats];
      for (const beat of list) assertBeat(beat);
      if (options.reduced) {
        for (const beat of list) deliver(beat, true);
        return;
      }
      queue.push(...list);
      if (flushing) return; // the drain loop picks these up
      if (!cancelTimer) pump();
    },
    flush,
    skip: flush,
    clear() {
      if (cancelTimer) {
        cancelTimer();
        cancelTimer = null;
      }
      waitingMs = 0;
      queue.length = 0;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeIdle(listener) {
      idleListeners.add(listener);
      return () => idleListeners.delete(listener);
    },
    pendingMs() {
      return queue.reduce((sum, beat) => sum + beat.durationMs, 0) + waitingMs;
    },
    isIdle() {
      return cancelTimer === null && queue.length === 0;
    },
  };
}

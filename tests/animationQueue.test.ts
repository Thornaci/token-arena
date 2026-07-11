import { describe, expect, it } from 'vitest';
import {
  createAnimationQueue,
  INPUT_BLOCK_LIMIT_MS,
  type AnimationBeat,
  type BeatDelivery,
} from '@/engine/animationQueue';

function beat(id: string, durationMs = 200, extra?: Partial<AnimationBeat>): AnimationBeat {
  return { id, kind: `kind-${id}`, durationMs, ...extra };
}

/** Manual scheduler — tests drive time by firing pending callbacks. */
function fakeScheduler() {
  const pending: { fn: () => void; ms: number }[] = [];
  return {
    schedule: (fn: () => void, ms: number) => {
      const entry = { fn, ms };
      pending.push(entry);
      return () => {
        const index = pending.indexOf(entry);
        if (index >= 0) pending.splice(index, 1);
      };
    },
    fire: () => {
      const entry = pending.shift();
      entry?.fn();
    },
    pending,
  };
}

function collect(queue: ReturnType<typeof createAnimationQueue>) {
  const deliveries: BeatDelivery[] = [];
  queue.subscribe((delivery) => deliveries.push(delivery));
  return deliveries;
}

describe('animationQueue — animated mode', () => {
  it('delivers the first beat immediately and the next only after its duration', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: false, schedule: clock.schedule });
    const seen = collect(queue);

    queue.enqueue([beat('a', 300), beat('b', 100)]);
    expect(seen.map((d) => d.beat.id)).toEqual(['a']);
    expect(seen[0]!.instant).toBe(false);
    expect(queue.pendingMs()).toBe(400); // b queued (100) + waiting on a (300)

    clock.fire(); // a's duration elapses
    expect(seen.map((d) => d.beat.id)).toEqual(['a', 'b']);
    expect(queue.pendingMs()).toBe(100);

    clock.fire();
    expect(queue.isIdle()).toBe(true);
    expect(queue.pendingMs()).toBe(0);
  });

  it('keeps FIFO order across separate enqueues', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: false, schedule: clock.schedule });
    const seen = collect(queue);

    queue.enqueue(beat('a'));
    queue.enqueue(beat('b'));
    queue.enqueue(beat('c'));
    clock.fire();
    clock.fire();
    clock.fire();
    expect(seen.map((d) => d.beat.id)).toEqual(['a', 'b', 'c']);
  });

  it('flush delivers the remainder in order, instantly, exactly once', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: false, schedule: clock.schedule });
    const seen = collect(queue);

    queue.enqueue([beat('a'), beat('b'), beat('c')]);
    queue.flush();
    expect(seen.map((d) => d.beat.id)).toEqual(['a', 'b', 'c']);
    expect(seen.map((d) => d.instant)).toEqual([false, true, true]);
    expect(queue.isIdle()).toBe(true);

    clock.fire(); // stale timer must have been cancelled — nothing new
    expect(seen).toHaveLength(3);
  });

  it('drains beats enqueued by a listener during flush', () => {
    const queue = createAnimationQueue({ reduced: false, schedule: fakeScheduler().schedule });
    const seen: string[] = [];
    queue.subscribe(({ beat: delivered }) => {
      seen.push(delivered.id);
      if (delivered.id === 'a') queue.enqueue(beat('follow-up'));
    });

    queue.enqueue([beat('a'), beat('b')]);
    queue.flush();
    expect(seen).toEqual(['a', 'b', 'follow-up']);
  });

  it('clear drops pending beats without delivering them', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: false, schedule: clock.schedule });
    const seen = collect(queue);

    queue.enqueue([beat('a'), beat('b')]);
    queue.clear();
    expect(seen.map((d) => d.beat.id)).toEqual(['a']); // 'a' was already delivered
    expect(queue.pendingMs()).toBe(0);
    expect(queue.isIdle()).toBe(true);
  });

  it('unsubscribe stops notifications', () => {
    const queue = createAnimationQueue({ reduced: false, schedule: fakeScheduler().schedule });
    const seen: string[] = [];
    const unsubscribe = queue.subscribe(({ beat: delivered }) => seen.push(delivered.id));
    queue.enqueue(beat('a', 0));
    unsubscribe();
    queue.enqueue(beat('b', 0));
    queue.flush();
    expect(seen).toEqual(['a']);
  });

  it('notifies idle when the chain completes', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: false, schedule: clock.schedule });
    let idleCount = 0;
    queue.subscribeIdle(() => idleCount++);

    queue.enqueue([beat('a'), beat('b')]);
    clock.fire();
    expect(idleCount).toBe(0);
    clock.fire(); // b delivered, waiting
    clock.fire(); // chain ends
    expect(idleCount).toBe(1);
  });

  it('rejects non-cinematic beats over the input-block limit (dev assert)', () => {
    const queue = createAnimationQueue({ reduced: false, schedule: fakeScheduler().schedule });
    expect(() => queue.enqueue(beat('slow', INPUT_BLOCK_LIMIT_MS + 1))).toThrow(/400ms/);
    expect(() =>
      queue.enqueue(beat('rupture', 600, { cinematic: true })),
    ).not.toThrow();
  });
});

describe('animationQueue — reduced mode', () => {
  it('delivers synchronously as instant with nothing pending', () => {
    const clock = fakeScheduler();
    const queue = createAnimationQueue({ reduced: true, schedule: clock.schedule });
    const seen = collect(queue);

    queue.enqueue([beat('a', 300), beat('b', 600, { cinematic: true })]);
    expect(seen.map((d) => d.beat.id)).toEqual(['a', 'b']);
    expect(seen.every((d) => d.instant)).toBe(true);
    expect(queue.pendingMs()).toBe(0);
    expect(queue.isIdle()).toBe(true);
    expect(clock.pending).toHaveLength(0); // no timers were ever scheduled
  });
});

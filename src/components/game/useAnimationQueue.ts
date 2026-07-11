import { useEffect, useMemo, useState } from 'react';
import {
  createAnimationQueue,
  type AnimationBeat,
  type BeatDelivery,
} from '@/engine/animationQueue';
import { useMotionPref, type MotionPref } from '@/lib/motionPref';

export interface SceneAnimation {
  enqueue: (beats: AnimationBeat | AnimationBeat[]) => void;
  skip: () => void;
  clear: () => void;
  pendingMs: () => number;
  /** Most recently delivered beat — scenes reduce it into visual state. */
  activeBeat: AnimationBeat | null;
  lastDelivery: BeatDelivery | null;
  isAnimating: boolean;
  pref: MotionPref;
}

/**
 * One animation queue per scene, wired to the motion preference. When the
 * preference flips to reduced the queue is recreated in always-flushed mode
 * (the old queue flushes on swap so no beat is lost).
 */
export function useAnimationQueue(): SceneAnimation {
  const pref = useMotionPref();
  const queue = useMemo(() => createAnimationQueue({ reduced: pref === 'reduced' }), [pref]);
  const [lastDelivery, setLastDelivery] = useState<BeatDelivery | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const unsubscribe = queue.subscribe((delivery) => {
      setLastDelivery(delivery);
      if (!delivery.instant) setIsAnimating(true);
    });
    const unsubscribeIdle = queue.subscribeIdle(() => setIsAnimating(false));
    return () => {
      queue.flush(); // deliver final states to the scene before swap/unmount
      unsubscribe();
      unsubscribeIdle();
    };
  }, [queue]);

  return {
    enqueue: queue.enqueue,
    skip: queue.skip,
    clear: queue.clear,
    pendingMs: queue.pendingMs,
    activeBeat: lastDelivery?.beat ?? null,
    lastDelivery,
    isAnimating,
    pref,
  };
}

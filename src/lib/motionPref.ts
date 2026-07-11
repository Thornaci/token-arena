import { useSyncExternalStore } from 'react';
import { useStore } from '@nanostores/react';
import { progress } from '@/stores/progress';

export type MotionPref = 'full' | 'reduced';

/**
 * The app setting and the OS media query compose as an AND of "may animate":
 * either side asking for reduced motion wins.
 */
export function effectiveMotion(setting: MotionPref, systemReduced: boolean): MotionPref {
  return setting === 'reduced' || systemReduced ? 'reduced' : 'full';
}

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribeSystem(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSystemReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

export function useMotionPref(): MotionPref {
  const systemReduced = useSyncExternalStore(subscribeSystem, getSystemReduced, () => false);
  const { settings } = useStore(progress);
  return effectiveMotion(settings.motion, systemReduced);
}

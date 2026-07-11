import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Lesson, MechanicName } from '@/content/schema';
import type { Locale } from '@/lib/locales';

export interface MechanicComponentProps {
  lesson: Lesson;
  locale: Locale;
  /** Idempotent: the lesson shell records completion/XP exactly once. */
  onPass: () => void;
}

export type MechanicComponent = ComponentType<MechanicComponentProps>;

/**
 * mechanic name (lesson data) → renderer component. New lesson *types* are
 * registered here once in code; any number of data-only lessons reuse them.
 * Entries are lazy so each mechanic ships as its own chunk.
 */
const registry: Partial<Record<MechanicName, LazyExoticComponent<MechanicComponent>>> = {
  'intro-tour': lazy(() => import('@/components/mechanics/IntroTour')),
  'tokenizer-playground': lazy(() => import('@/components/mechanics/TokenizerChallenge')),
  'token-compare': lazy(() => import('@/components/mechanics/TokenCompare')),
  'stateless-chat': lazy(() => import('@/components/mechanics/StatelessChat')),
  'history-bill': lazy(() => import('@/components/mechanics/HistoryBill')),
};

export function getMechanic(name: MechanicName): LazyExoticComponent<MechanicComponent> | null {
  return registry[name] ?? null;
}

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
  'window-fit': lazy(() => import('@/components/mechanics/WindowFit')),
  'output-reserve': lazy(() => import('@/components/mechanics/OutputReserve')),
  'hierarchy-predict': lazy(() => import('@/components/mechanics/HierarchyPredict')),
  'injection-defense': lazy(() => import('@/components/mechanics/InjectionDefense')),
  'needle-lab': lazy(() => import('@/components/mechanics/NeedleLab')),
  tradeoff: lazy(() => import('@/components/mechanics/Tradeoff')),
  'sampling-lab': lazy(() => import('@/components/mechanics/SamplingLab')),
  quiz: lazy(() => import('@/components/mechanics/Quiz')),
  'config-inject': lazy(() => import('@/components/mechanics/ConfigInject')),
  'rules-trim': lazy(() => import('@/components/mechanics/RulesTrim')),
  'tool-loop': lazy(() => import('@/components/mechanics/ToolLoop')),
  'compaction-sim': lazy(() => import('@/components/mechanics/CompactionSim')),
};

export function getMechanic(name: MechanicName): LazyExoticComponent<MechanicComponent> | null {
  return registry[name] ?? null;
}

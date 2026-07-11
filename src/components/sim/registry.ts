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
  'model-indecision': lazy(() => import('@/components/mechanics/ModelIndecision')),
  'byok-chat': lazy(() => import('@/components/mechanics/ByokChat')),
};

export function getMechanic(name: MechanicName): LazyExoticComponent<MechanicComponent> | null {
  return registry[name] ?? null;
}

/**
 * Direct-manipulation "game" renderers (Iteration 2). A mechanic listed here
 * renders as a physical scene by default; the classic component above stays
 * registered forever as the fallback / Classic-mode / data-opt-out substrate.
 */
const gameRegistry: Partial<Record<MechanicName, LazyExoticComponent<MechanicComponent>>> = {
  'window-fit': lazy(() => import('@/components/game/scenes/ContainerScene')),
  'output-reserve': lazy(() => import('@/components/game/scenes/ContainerScene')),
  'needle-lab': lazy(() => import('@/components/game/scenes/CorridorScene')),
  'stateless-chat': lazy(() => import('@/components/game/scenes/ConveyorScene')),
  'history-bill': lazy(() => import('@/components/game/scenes/ConveyorScene')),
  'tokenizer-playground': lazy(() => import('@/components/game/scenes/TokenScaleScene')),
  'token-compare': lazy(() => import('@/components/game/scenes/TokenScaleScene')),
  'hierarchy-predict': lazy(() => import('@/components/game/scenes/TowerScene')),
  'injection-defense': lazy(() => import('@/components/game/scenes/RoutingScene')),
  'compaction-sim': lazy(() => import('@/components/game/scenes/CompactorScene')),
};

export type RendererVariant = 'game' | 'classic';

export interface ResolvedMechanic {
  Component: LazyExoticComponent<MechanicComponent>;
  variant: RendererVariant;
}

/**
 * Resolution order (spec §6.1):
 * 1. global Classic-mode setting — the accessibility escape hatch, wins always
 * 2. the lesson's optional `renderer: 'classic'` data opt-out
 * 3. a registered game variant
 * 4. the classic component
 * prefers-reduced-motion never changes the renderer — reduced motion means an
 * always-flushed animation queue INSIDE the game renderer, not classic.
 */
export function resolveMechanic(
  lesson: Lesson,
  rendererSetting: RendererVariant,
): ResolvedMechanic | null {
  const classic = registry[lesson.mechanic] ?? null;
  const game = gameRegistry[lesson.mechanic] ?? null;
  const forceClassic = rendererSetting === 'classic' || lesson.renderer === 'classic';
  if (!forceClassic && game) return { Component: game, variant: 'game' };
  return classic ? { Component: classic, variant: 'classic' } : null;
}

import type { ComponentType, LazyExoticComponent } from 'react';
import type { Lesson, MechanicName } from '@/content/schema';
import type { Locale } from '@/lib/locales';

export interface MechanicComponentProps {
  lesson: Lesson;
  locale: Locale;
}

export type MechanicComponent = ComponentType<MechanicComponentProps>;

/**
 * mechanic name (lesson data) → renderer component. New lesson *types* are
 * registered here once in code; any number of data-only lessons reuse them.
 * Entries are lazy so each mechanic ships as its own chunk.
 */
const registry: Partial<Record<MechanicName, LazyExoticComponent<MechanicComponent>>> = {
  // Mechanics are registered as they are implemented (Modules 0–2 first).
};

export function getMechanic(name: MechanicName): LazyExoticComponent<MechanicComponent> | null {
  return registry[name] ?? null;
}

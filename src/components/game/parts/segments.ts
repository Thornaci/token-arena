import type { ContextBlock, ContextSegments } from '@/engine/contextModel';
import { segmentOf } from '@/engine/contextModel';

/**
 * The exact segment palette the Context Inspector uses (its SEGMENTS table) —
 * physical scenes and the inspector must read as one system (spec §7).
 */
export const SEGMENT_COLOR: Record<keyof ContextSegments, string> = {
  system: 'var(--color-role-system)',
  config: 'var(--color-ice)',
  files: 'var(--color-role-file)',
  tools: 'var(--color-role-tool)',
  history: 'var(--color-phosphor)',
  reservedOutput: 'var(--color-role-reserved)',
};

export function blockColor(block: ContextBlock): string {
  return SEGMENT_COLOR[segmentOf(block)];
}

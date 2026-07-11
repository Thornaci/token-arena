import type { ModuleId } from './schema';

export interface ModuleInfo {
  id: ModuleId;
  order: number;
  titleKey: string;
}

/** Display order of the curriculum; the world map shows future modules as locked. */
export const MODULES: readonly ModuleInfo[] = [
  { id: 'onboarding', order: 0, titleKey: 'module_onboarding_title' },
  { id: 'tokens', order: 1, titleKey: 'module_tokens_title' },
  { id: 'request-loop', order: 2, titleKey: 'module_request_loop_title' },
  { id: 'context-window', order: 3, titleKey: 'module_context_window_title' },
  { id: 'hierarchy', order: 4, titleKey: 'module_hierarchy_title' },
  { id: 'rot', order: 5, titleKey: 'module_rot_title' },
  { id: 'sampling', order: 6, titleKey: 'module_sampling_title' },
  { id: 'ecosystem', order: 7, titleKey: 'module_ecosystem_title' },
  { id: 'tools', order: 8, titleKey: 'module_tools_title' },
  { id: 'agents', order: 9, titleKey: 'module_agents_title' },
  { id: 'sandbox', order: 10, titleKey: 'module_sandbox_title' },
];

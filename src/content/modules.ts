import type { ModuleId } from './schema';

export interface ModuleInfo {
  id: ModuleId;
  titleKey: string;
  /**
   * Modules for people who build with AI (coding agents, config files, raw API
   * calls). They sit together at the end of the map under one divider, so the
   * path through how-it-works never runs through them.
   */
  section?: 'developers';
}

/**
 * The curriculum, in display order. Position IS the order: the map's module
 * numbers and lesson labels ("3.2") derive from it, so reordering modules
 * never renumbers lesson ids, URLs or saved progress.
 */
export const MODULES: readonly ModuleInfo[] = [
  { id: 'onboarding', titleKey: 'module_onboarding_title' },
  { id: 'tokens', titleKey: 'module_tokens_title' },
  { id: 'inside-model', titleKey: 'module_inside_model_title' },
  { id: 'sampling', titleKey: 'module_sampling_title' },
  { id: 'training', titleKey: 'module_training_title' },
  { id: 'request-loop', titleKey: 'module_request_loop_title' },
  { id: 'context-window', titleKey: 'module_context_window_title' },
  { id: 'new-models', titleKey: 'module_new_models_title' },
  { id: 'hierarchy', titleKey: 'module_hierarchy_title' },
  { id: 'rot', titleKey: 'module_rot_title' },
  { id: 'tools', titleKey: 'module_tools_title' },
  { id: 'agents', titleKey: 'module_agents_title' },
  { id: 'ecosystem', titleKey: 'module_ecosystem_title', section: 'developers' },
  { id: 'harness', titleKey: 'module_harness_title', section: 'developers' },
  { id: 'sandbox', titleKey: 'module_sandbox_title', section: 'developers' },
];

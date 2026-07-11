import type { ModelProfile } from './contextModel';

/**
 * Context-window sizes are configurable data, not facts baked into logic:
 * vendor numbers change fast, and the curriculum teaches that advertised
 * size ≠ effective size. Lessons reference profiles by id.
 */
export const MODEL_PROFILES: readonly ModelProfile[] = [
  {
    id: 'generic-8k',
    labelKey: 'models_generic8k',
    family: 'generic',
    contextWindow: 8_000,
    encoding: 'o200k_base',
    countIsEstimate: false,
  },
  {
    id: 'generic-128k',
    labelKey: 'models_generic128k',
    family: 'generic',
    contextWindow: 128_000,
    encoding: 'o200k_base',
    countIsEstimate: false,
  },
  {
    id: 'generic-200k',
    labelKey: 'models_generic200k',
    family: 'generic',
    contextWindow: 200_000,
    encoding: 'o200k_base',
    countIsEstimate: false,
  },
  {
    id: 'generic-1m',
    labelKey: 'models_generic1m',
    family: 'generic',
    contextWindow: 1_000_000,
    encoding: 'o200k_base',
    countIsEstimate: false,
  },
  {
    id: 'gpt-class-128k',
    labelKey: 'models_gptClass',
    family: 'openai',
    contextWindow: 128_000,
    encoding: 'o200k_base',
    countIsEstimate: false,
  },
  {
    id: 'claude-class-200k',
    labelKey: 'models_claudeClass',
    family: 'anthropic',
    contextWindow: 200_000,
    encoding: 'o200k_base',
    countIsEstimate: true,
  },
  {
    id: 'gemini-class-1m',
    labelKey: 'models_geminiClass',
    family: 'google',
    contextWindow: 1_000_000,
    encoding: 'o200k_base',
    countIsEstimate: true,
  },
];

export function getModelProfile(id: string): ModelProfile {
  const profile = MODEL_PROFILES.find((p) => p.id === id);
  if (!profile) throw new Error(`Unknown model profile: ${id}`);
  return profile;
}

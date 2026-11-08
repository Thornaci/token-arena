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
  // Real current models (verified on the vendors' model pages, November 2026).
  // Labels name the family: BYOK defaults to the small siblings (gpt-6-luna,
  // claude-haiku-5-5), which share the flagship's window. None of these ship
  // an open tokenizer this app can load, so counts are o200k approximations.
  {
    id: 'gpt-6',
    labelKey: 'models_gpt6',
    family: 'openai',
    contextWindow: 1_050_000,
    encoding: 'o200k_base',
    countIsEstimate: true,
  },
  {
    id: 'claude-5-5',
    labelKey: 'models_claude55',
    family: 'anthropic',
    contextWindow: 1_000_000,
    encoding: 'o200k_base',
    countIsEstimate: true,
  },
  {
    id: 'gemini-4',
    labelKey: 'models_gemini4',
    family: 'google',
    contextWindow: 1_048_576,
    encoding: 'o200k_base',
    countIsEstimate: true,
  },
];

export function getModelProfile(id: string): ModelProfile {
  const profile = MODEL_PROFILES.find((p) => p.id === id);
  if (!profile) throw new Error(`Unknown model profile: ${id}`);
  return profile;
}

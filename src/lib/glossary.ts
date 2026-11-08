/**
 * Glossary terms in learning order. Each id needs `glossary_<id>_term` and
 * `glossary_<id>_def` in every catalog (locked by tests/glossary.test.ts).
 * Ids double as URL anchors: /<locale>/glossary/#<id>.
 */
export const GLOSSARY_TERMS = [
  'ai_model',
  'token',
  'tokenizer',
  'prompt',
  'system_prompt',
  'next_token',
  'probability',
  'temperature',
  'embedding',
  'attention',
  'parameters',
  'training',
  'hallucination',
  'knowledge_cutoff',
  'stateless',
  'api',
  'context_window',
  'caching',
  'reasoning',
  'multimodal',
  'prompt_injection',
  'context_rot',
  'tool_use',
  'agent',
  'compaction',
] as const;

export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];

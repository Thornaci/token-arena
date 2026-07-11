import { z } from 'astro/zod';
import enCatalog from '../../messages/en.json';
import { ENCODINGS } from '@/lib/tokenizer';
import { MODEL_PROFILES } from '@/engine/modelProfiles';
import type { ContextBlock, Role } from '@/engine/contextModel';
import type { SimStep } from '@/engine/simEngine';
import type { PassCheck } from '@/engine/scoring';

/**
 * Lessons are data, not code. This schema validates community-contributed
 * lesson JSON at build time, including that every referenced i18n key
 * actually exists in the base (English) catalog.
 */

export const MODULE_IDS = [
  'onboarding',
  'tokens',
  'request-loop',
  'context-window',
  'hierarchy',
  'rot',
  'sampling',
  'ecosystem',
  'tools',
  'agents',
  'sandbox',
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

const MODEL_IDS = MODEL_PROFILES.map((p) => p.id) as [string, ...string[]];

const encodingSchema = z.enum(ENCODINGS);

const roleSchema: z.ZodType<Role> = z.enum(['system', 'developer', 'user', 'assistant', 'tool']);

// Lesson blocks carry i18n keys and authored token counts — never live
// `text`, which would make counts (and pass/fail) vary by locale.
const contextBlockSchema: z.ZodType<ContextBlock> = z
  .object({
    id: z.string().min(1),
    role: roleSchema,
    kind: z.enum(['message', 'config-file', 'attachment', 'tool-def', 'tool-result']),
    labelKey: z.string().optional(),
    textKey: z.string().optional(),
    fixedTokens: z.number().int().nonnegative(),
  })
  .strict();

const simStepSchema: z.ZodType<SimStep> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('narrate'), textKey: z.string() }).strict(),
  z.object({ type: z.literal('setModel'), modelId: z.enum(MODEL_IDS) }).strict(),
  z.object({ type: z.literal('setReservedOutput'), tokens: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('addBlock'), block: contextBlockSchema }).strict(),
  z.object({ type: z.literal('removeBlock'), blockId: z.string() }).strict(),
  z.object({ type: z.literal('sendRequest'), noteKey: z.string().optional() }).strict(),
  z
    .object({
      type: z.literal('freeze'),
      noteKey: z.string(),
      targetBlockId: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal('ask'), questionId: z.string() }).strict(),
]) as z.ZodType<SimStep>;

const passCheckSchema: z.ZodType<PassCheck> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('tokenTarget'),
      comparator: z.enum(['lte', 'gte']),
      target: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('multiTokenWord'), minTokens: z.number().int().min(2) }).strict(),
  z.object({ type: z.literal('choice'), correctIndex: z.number().int().nonnegative() }).strict(),
  z
    .object({
      type: z.literal('choiceRounds'),
      correctIndexes: z.array(z.number().int().nonnegative()).min(1),
      minCorrect: z.number().int().positive(),
    })
    .strict(),
  z.object({ type: z.literal('completeAll'), count: z.number().int().positive() }).strict(),
]) as z.ZodType<PassCheck>;

/** Unscored lessons (onboarding, exploratory) complete on finishing the flow. */
const lessonPassSchema = z.union([passCheckSchema, z.object({ type: z.literal('none') }).strict()]);

export type LessonPass = PassCheck | { type: 'none' };

const initialStateSchema = z
  .object({
    modelId: z.enum(MODEL_IDS),
    reservedOutput: z.number().int().nonnegative().default(0),
    blocks: z.array(contextBlockSchema).default([]),
  })
  .strict();

// --- Mechanic-specific parameters (discriminated on `mechanic`) -------------

const introTourParams = z
  .object({
    slides: z
      .array(
        z
          .object({
            textKey: z.string(),
            highlight: z.enum(['none', 'inspector', 'blocks', 'fill']).default('none'),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const playgroundChallengeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('reduceTokens'),
      id: z.string(),
      promptKey: z.string(),
      // Literal sample text, identical for every locale so the target is
      // deterministic; include samples in several languages instead.
      seedText: z.string().min(1),
      targetTokens: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('findMultiTokenWord'),
      id: z.string(),
      promptKey: z.string(),
      minTokens: z.number().int().min(2),
    })
    .strict(),
]);

const tokenizerPlaygroundParams = z
  .object({
    defaultEncoding: encodingSchema,
    challenges: z.array(playgroundChallengeSchema).min(1),
  })
  .strict();

const tokenCompareParams = z
  .object({
    encoding: encodingSchema,
    rounds: z
      .array(
        z
          .object({
            promptKey: z.string(),
            a: z.string().min(1),
            b: z.string().min(1),
            explainKey: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const statelessChatParams = z
  .object({
    turns: z
      .array(
        z
          .object({
            userKey: z.string(),
            userTokens: z.number().int().positive(),
            assistantKey: z.string(),
            assistantTokens: z.number().int().positive(),
          })
          .strict(),
      )
      .min(2),
    question: z
      .object({ promptKey: z.string(), optionKeys: z.array(z.string()).min(2) })
      .strict(),
  })
  .strict();

const historyBillParams = z
  .object({
    turns: z
      .array(
        z
          .object({
            labelKey: z.string(),
            inputTokens: z.number().int().positive(),
            outputTokens: z.number().int().positive(),
          })
          .strict(),
      )
      .min(2),
    /** Price per 1M input tokens, in abstract credits (vendor-neutral). */
    pricePerMTokIn: z.number().positive(),
    /** Cached-prefix reads cost this fraction of the standard input price. */
    cachedReadFactor: z.number().gt(0).lt(1),
    question: z
      .object({ promptKey: z.string(), optionKeys: z.array(z.string()).min(2) })
      .strict(),
  })
  .strict();

// --- The lesson itself -------------------------------------------------------

const lessonBaseSchema = z.object({
  id: z.string().regex(/^[A-Z]?\d+\.\d+$|^M\d+$/, 'use "L<module>.<order>" or "M<module>"'),
  module: z.enum(MODULE_IDS),
  order: z.number().int().nonnegative(),
  titleKey: z.string(),
  objectiveKey: z.string(),
  misconceptionKey: z.string().nullable(),
  /** Which ecosystem tab this variant belongs to; null = tool-agnostic. */
  ecosystem: z.enum(['claude', 'openai', 'cursor']).nullable().default(null),
  /** Show the Context Inspector on this level. */
  inspector: z.boolean(),
  initialState: initialStateSchema.optional(),
  steps: z.array(simStepSchema).default([]),
  pass: lessonPassSchema,
  hints: z.tuple([z.string(), z.string(), z.string()]),
  xp: z.number().int().nonnegative(),
  badge: z.string().nullable().default(null),
});

const EN_KEYS = new Set(Object.keys(enCatalog).filter((k) => k !== '$schema'));

/**
 * Recursively collects every i18n key referenced by a lesson: any string
 * under a property named `*Key`, `*Keys`, or `hints`.
 */
export function collectMessageKeys(value: unknown, found: string[] = [], parentName = ''): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectMessageKeys(item, found, parentName);
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value)) {
      collectMessageKeys(child, found, name);
    }
  } else if (
    typeof value === 'string' &&
    (parentName.endsWith('Key') || parentName.endsWith('Keys') || parentName === 'hints')
  ) {
    found.push(value);
  }
  return found;
}

// NOTE: deliberately NOT `lessonBaseSchema.and(discriminatedUnion)` — the
// bundled zod's intersection swallows nested strict-object violations (a
// block with a stray `text` field parses fine through the intersection even
// though each side alone rejects it). Merging base + variant into flat
// objects keeps every check live.
function variant<M extends string, P extends z.ZodTypeAny>(mechanic: M, params: P) {
  return lessonBaseSchema.extend({ mechanic: z.literal(mechanic), params });
}

export const lessonSchema = z
  .discriminatedUnion('mechanic', [
    variant('intro-tour', introTourParams),
    variant('tokenizer-playground', tokenizerPlaygroundParams),
    variant('token-compare', tokenCompareParams),
    variant('stateless-chat', statelessChatParams),
    variant('history-bill', historyBillParams),
  ])
  .superRefine((lesson, ctx) => {
    // Every referenced message key must exist in the base catalog, so a
    // lesson can never render raw keys because of a typo.
    for (const key of collectMessageKeys(lesson)) {
      if (!EN_KEYS.has(key)) {
        ctx.addIssue({
          code: 'custom',
          message: `i18n key "${key}" is missing from messages/en.json`,
        });
      }
    }
    // Mechanics that walk a scripted conversation need a starting context.
    if (
      (lesson.mechanic === 'stateless-chat' || lesson.mechanic === 'history-bill') &&
      !lesson.initialState
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `mechanic "${lesson.mechanic}" requires initialState`,
      });
    }
    // Round-based passes must line up with the authored rounds.
    if (lesson.mechanic === 'token-compare') {
      if (lesson.pass.type !== 'choiceRounds') {
        ctx.addIssue({
          code: 'custom',
          message: 'token-compare lessons must use a choiceRounds pass',
        });
      } else if (lesson.pass.correctIndexes.length !== lesson.params.rounds.length) {
        ctx.addIssue({
          code: 'custom',
          message: `pass.correctIndexes length ${lesson.pass.correctIndexes.length} ≠ rounds length ${lesson.params.rounds.length}`,
        });
      }
    }
    if (lesson.mechanic === 'tokenizer-playground') {
      if (lesson.pass.type !== 'completeAll') {
        ctx.addIssue({
          code: 'custom',
          message: 'tokenizer-playground lessons must use a completeAll pass',
        });
      } else if (lesson.pass.count !== lesson.params.challenges.length) {
        ctx.addIssue({
          code: 'custom',
          message: `pass.count ${lesson.pass.count} ≠ challenges length ${lesson.params.challenges.length}`,
        });
      }
    }
  });

export type Lesson = z.infer<typeof lessonSchema>;

export type MechanicName = Lesson['mechanic'];

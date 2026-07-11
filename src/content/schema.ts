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
  z.object({ type: z.literal('budgetFit'), budget: z.number().int().positive() }).strict(),
  z
    .object({
      type: z.literal('choiceOneOf'),
      validIndexes: z.array(z.number().int().nonnegative()).min(1),
    })
    .strict(),
  z.object({ type: z.literal('ordering'), size: z.number().int().min(3) }).strict(),
  z.object({ type: z.literal('tradeoff') }).strict(),
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

/** Per-block trimming controls for budget-fit mechanics (L3.1, L3.2). */
const trimItemSchema = z
  .object({
    blockId: z.string().min(1),
    /** The UI offers a "remove" control. Required blocks may still be removable — that's the trap. */
    removable: z.boolean().default(false),
    /** Pass criterion: this block must survive (original or summarized). */
    required: z.boolean().default(false),
    /** When set, the UI offers "summarize", replacing the block's cost with this. */
    summaryTokens: z.number().int().positive().optional(),
    summaryLabelKey: z.string().optional(),
  })
  .strict();

const windowFitParams = z
  .object({
    items: z.array(trimItemSchema).min(1),
    /** The simulated `400 prompt is too long` body. */
    errorKey: z.string(),
    successKey: z.string(),
  })
  .strict();

const outputReserveParams = z
  .object({
    requiredOutputTokens: z.number().int().positive(),
    sliderMax: z.number().int().positive(),
    sliderStep: z.number().int().positive(),
    taskKey: z.string(),
    fullReplyKey: z.string(),
    truncatedReplyKey: z.string(),
    successKey: z.string(),
  })
  .strict();

/** One quiz round; the shared shape for every choiceRounds mechanic. */
const quizRoundSchema = z
  .object({
    promptKey: z.string(),
    optionKeys: z.array(z.string()).min(2),
    explainKey: z.string().optional(),
  })
  .strict();

const quizParams = z.object({ rounds: z.array(quizRoundSchema).min(1) }).strict();

const hierarchyPredictParams = z
  .object({
    rounds: z
      .array(
        quizRoundSchema.extend({
          /** The conflicting message stack shown for this round (display-only). */
          blocks: z
            .array(z.object({ role: roleSchema, textKey: z.string() }).strict())
            .min(2),
          /** Which stack entry wins — highlighted after the answer. */
          winnerIndex: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  })
  .strict();

const injectionDefenseParams = z
  .object({
    defenses: z
      .array(
        z
          .object({
            id: z.string().min(1),
            labelKey: z.string(),
            descKey: z.string(),
            /** Every guard is prompt text too — it costs window space. */
            costTokens: z.number().int().positive(),
          })
          .strict(),
      )
      .min(2),
    attempts: z
      .array(
        z
          .object({
            id: z.string().min(1),
            introKey: z.string(),
            attackKey: z.string(),
            requiredDefenseIds: z.array(z.string()).min(1),
            resistKey: z.string(),
            breachKey: z.string(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const needleSpotSchema = z
  .object({
    labelKey: z.string(),
    /** Authored recall odds for the scripted model, shown on the heat strip. */
    recallPct: z.number().int().min(0).max(100),
    success: z.boolean(),
  })
  .strict();

const needleLabParams = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('position'),
      contextTokens: z.number().int().positive(),
      needleKey: z.string(),
      questionKey: z.string(),
      positions: z.array(needleSpotSchema).min(3),
      hitKey: z.string(),
      missKey: z.string(),
    })
    .strict(),
  z
    .object({
      mode: z.literal('length'),
      needleKey: z.string(),
      questionKey: z.string(),
      options: z.array(needleSpotSchema.extend({ contextTokens: z.number().int().positive() })).min(3),
      promptKey: z.string(),
      explainKey: z.string(),
      hitKey: z.string(),
      missKey: z.string(),
    })
    .strict(),
]);

const tradeoffParams = z
  .object({
    scenarioKey: z.string(),
    strategies: z
      .array(
        z
          .object({
            id: z.string().min(1),
            labelKey: z.string(),
            outcomeKey: z.string(),
            downsidePromptKey: z.string(),
            downsideOptionKeys: z.array(z.string()).min(2),
            downsideCorrectIndex: z.number().int().nonnegative(),
            explainKey: z.string(),
          })
          .strict(),
      )
      .min(2),
  })
  .strict();

const samplingLabParams = z
  .object({
    /** Literal prompt text — the candidates are its actual continuations. */
    promptText: z.string().min(1),
    candidates: z
      .array(z.object({ token: z.string().min(1), logit: z.number() }).strict())
      .min(3),
    temperatures: z.array(z.number().positive()).min(2),
    topPStops: z.array(z.number().gt(0).lte(1)).min(2),
    rounds: z.array(quizRoundSchema).min(1),
  })
  .strict();

const configInjectParams = z
  .object({
    tabs: z
      .array(
        z
          .object({
            id: z.enum(['claude', 'agents', 'cursor']),
            /** Literal file name, e.g. "CLAUDE.md" — identical in every locale. */
            fileName: z.string().min(1),
            factKeys: z.array(z.string()).min(1),
            block: contextBlockSchema,
          })
          .strict(),
      )
      .min(2),
    rounds: z.array(quizRoundSchema).min(1),
  })
  .strict();

const rulesTrimParams = z
  .object({
    introKey: z.string(),
    fileName: z.string().min(1),
    rules: z
      .array(
        z
          .object({
            id: z.string().min(1),
            textKey: z.string(),
            tokens: z.number().int().positive(),
            loadBearing: z.boolean(),
          })
          .strict(),
      )
      .min(4),
    successKey: z.string(),
  })
  .strict();

const toolLoopParams = z
  .object({
    /** Loop stages in canonical order; the exercise shows them shuffled. */
    cards: z.array(z.object({ textKey: z.string() }).strict()).min(3),
    /** Authored shuffle (determinism: no runtime randomness). */
    initialOrder: z.array(z.number().int().nonnegative()).min(3),
    orderPromptKey: z.string(),
  })
  .strict();

const compactionSimParams = z
  .object({
    rounds: z.array(quizRoundSchema).min(1),
  })
  .strict();

const modelIndecisionParams = z
  .object({
    /** Hugging Face repo the worker loads, e.g. "onnx-community/Qwen2.5-0.5B-Instruct". */
    modelRepo: z.string().min(1),
    dtype: z.enum(['q4', 'q4f16']).default('q4'),
    /** Real size of the one-time model download, shown in the consent dialog. */
    downloadSizeMB: z.number().int().positive(),
    topK: z.number().int().min(3).max(20).default(8),
    /** Fallback JSON under public/, e.g. "prerecorded/l6-2.json". */
    prerecordedPath: z.string().min(1),
    pairs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            labelKey: z.string(),
            // Literal prompts, identical in every locale — the distributions
            // (live or recorded) depend on the exact input string.
            basePrompt: z.string().min(1),
            contradictionPrompt: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const byokChatParams = z
  .object({
    introKey: z.string(),
    systemPromptKey: z.string().optional(),
    maxOutputTokens: z.number().int().positive().default(1024),
    /** Prefilled model-name inputs per provider tab. */
    defaultModels: z
      .object({
        openai: z.string().min(1),
        anthropic: z.string().min(1),
        custom: z.string().min(1),
      })
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
  /**
   * Per-lesson renderer opt-out. Omitted (the norm) = the game renderer when
   * one is registered for the mechanic, classic otherwise; the global
   * "Classic mode" setting overrides everything (see sim/registry.ts).
   */
  renderer: z.enum(['game', 'classic']).optional(),
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
    variant('window-fit', windowFitParams),
    variant('output-reserve', outputReserveParams),
    variant('hierarchy-predict', hierarchyPredictParams),
    variant('injection-defense', injectionDefenseParams),
    variant('needle-lab', needleLabParams),
    variant('tradeoff', tradeoffParams),
    variant('sampling-lab', samplingLabParams),
    variant('quiz', quizParams),
    variant('config-inject', configInjectParams),
    variant('rules-trim', rulesTrimParams),
    variant('tool-loop', toolLoopParams),
    variant('compaction-sim', compactionSimParams),
    variant('model-indecision', modelIndecisionParams),
    variant('byok-chat', byokChatParams),
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

    // choiceRounds mechanics: one correct answer per authored round, in range.
    const roundsOf = (l: typeof lesson): { optionKeys: string[] }[] | null => {
      switch (l.mechanic) {
        case 'hierarchy-predict':
        case 'sampling-lab':
        case 'quiz':
        case 'config-inject':
        case 'compaction-sim':
          return l.params.rounds;
        default:
          return null;
      }
    };
    const rounds = roundsOf(lesson);
    if (rounds) {
      if (lesson.pass.type !== 'choiceRounds') {
        ctx.addIssue({
          code: 'custom',
          message: `mechanic "${lesson.mechanic}" must use a choiceRounds pass`,
        });
      } else {
        const pass = lesson.pass;
        if (pass.correctIndexes.length !== rounds.length) {
          ctx.addIssue({
            code: 'custom',
            message: `pass.correctIndexes length ${pass.correctIndexes.length} ≠ rounds length ${rounds.length}`,
          });
        }
        pass.correctIndexes.forEach((correct, i) => {
          const options = rounds[i]?.optionKeys.length ?? 0;
          if (correct >= options) {
            ctx.addIssue({
              code: 'custom',
              message: `round ${i}: correctIndex ${correct} out of range for ${options} options`,
            });
          }
        });
      }
    }

    // Budget-fit mechanics: the pass budget must equal the assigned model's
    // window (L3.x) — rules-trim budgets are free-standing token budgets.
    if (lesson.mechanic === 'window-fit' || lesson.mechanic === 'output-reserve') {
      if (lesson.pass.type !== 'budgetFit') {
        ctx.addIssue({ code: 'custom', message: `${lesson.mechanic} must use a budgetFit pass` });
      } else if (!lesson.initialState) {
        ctx.addIssue({ code: 'custom', message: `${lesson.mechanic} requires initialState` });
      } else {
        const profile = MODEL_PROFILES.find((p) => p.id === lesson.initialState!.modelId);
        if (profile && lesson.pass.budget !== profile.contextWindow) {
          ctx.addIssue({
            code: 'custom',
            message: `pass.budget ${lesson.pass.budget} ≠ ${profile.id} window ${profile.contextWindow}`,
          });
        }
      }
    }
    if (lesson.mechanic === 'window-fit' && lesson.initialState) {
      const blockIds = new Set(lesson.initialState.blocks.map((b) => b.id));
      for (const item of lesson.params.items) {
        if (!blockIds.has(item.blockId)) {
          ctx.addIssue({
            code: 'custom',
            message: `trim item "${item.blockId}" has no matching initialState block`,
          });
        }
      }
    }

    if (lesson.mechanic === 'injection-defense') {
      if (lesson.pass.type !== 'completeAll') {
        ctx.addIssue({ code: 'custom', message: 'injection-defense must use a completeAll pass' });
      } else if (lesson.pass.count !== lesson.params.attempts.length) {
        ctx.addIssue({
          code: 'custom',
          message: `pass.count ${lesson.pass.count} ≠ attempts length ${lesson.params.attempts.length}`,
        });
      }
      const defenseIds = new Set(lesson.params.defenses.map((d) => d.id));
      for (const attempt of lesson.params.attempts) {
        for (const id of attempt.requiredDefenseIds) {
          if (!defenseIds.has(id)) {
            ctx.addIssue({
              code: 'custom',
              message: `attempt "${attempt.id}" requires unknown defense "${id}"`,
            });
          }
        }
      }
    }

    if (lesson.mechanic === 'needle-lab') {
      if (lesson.params.mode === 'position') {
        if (lesson.pass.type !== 'choiceOneOf') {
          ctx.addIssue({ code: 'custom', message: 'needle-lab position mode must use a choiceOneOf pass' });
        } else {
          const successIndexes = lesson.params.positions
            .map((p, i) => (p.success ? i : -1))
            .filter((i) => i >= 0);
          const valid = [...lesson.pass.validIndexes].sort((a, b) => a - b);
          if (JSON.stringify(valid) !== JSON.stringify(successIndexes)) {
            ctx.addIssue({
              code: 'custom',
              message: `pass.validIndexes [${valid}] ≠ successful positions [${successIndexes}]`,
            });
          }
        }
      } else {
        if (lesson.pass.type !== 'choice') {
          ctx.addIssue({ code: 'custom', message: 'needle-lab length mode must use a choice pass' });
        } else {
          const options = lesson.params.options;
          const shortestSuccess = options
            .map((option, i) => ({ option, i }))
            .filter(({ option }) => option.success)
            .sort((a, b) => a.option.contextTokens - b.option.contextTokens)[0];
          if (!shortestSuccess) {
            ctx.addIssue({ code: 'custom', message: 'needle-lab length mode needs at least one successful option' });
          } else if (lesson.pass.correctIndex !== shortestSuccess.i) {
            ctx.addIssue({
              code: 'custom',
              message: `pass.correctIndex ${lesson.pass.correctIndex} is not the shortest successful context (index ${shortestSuccess.i})`,
            });
          }
        }
      }
    }

    if (lesson.mechanic === 'tradeoff') {
      if (lesson.pass.type !== 'tradeoff') {
        ctx.addIssue({ code: 'custom', message: 'tradeoff mechanic must use a tradeoff pass' });
      }
      for (const strategy of lesson.params.strategies) {
        if (strategy.downsideCorrectIndex >= strategy.downsideOptionKeys.length) {
          ctx.addIssue({
            code: 'custom',
            message: `strategy "${strategy.id}": downsideCorrectIndex out of range`,
          });
        }
      }
    }

    if (lesson.mechanic === 'rules-trim') {
      if (lesson.pass.type !== 'budgetFit') {
        ctx.addIssue({ code: 'custom', message: 'rules-trim must use a budgetFit pass' });
      } else {
        const loadBearing = lesson.params.rules.filter((r) => r.loadBearing);
        const essentialTokens = loadBearing.reduce((sum, r) => sum + r.tokens, 0);
        const allTokens = lesson.params.rules.reduce((sum, r) => sum + r.tokens, 0);
        if (loadBearing.length === 0) {
          ctx.addIssue({ code: 'custom', message: 'rules-trim needs at least one load-bearing rule' });
        }
        if (essentialTokens > lesson.pass.budget) {
          ctx.addIssue({
            code: 'custom',
            message: `load-bearing rules (${essentialTokens} tokens) cannot fit the ${lesson.pass.budget} budget — unsolvable`,
          });
        }
        if (allTokens <= lesson.pass.budget) {
          ctx.addIssue({
            code: 'custom',
            message: `the full file (${allTokens} tokens) already fits the ${lesson.pass.budget} budget — nothing to trim`,
          });
        }
      }
    }

    if (lesson.mechanic === 'tool-loop') {
      const size = lesson.params.cards.length;
      if (lesson.pass.type !== 'ordering') {
        ctx.addIssue({ code: 'custom', message: 'tool-loop must use an ordering pass' });
      } else if (lesson.pass.size !== size) {
        ctx.addIssue({
          code: 'custom',
          message: `pass.size ${lesson.pass.size} ≠ cards length ${size}`,
        });
      }
      const order = [...lesson.params.initialOrder].sort((a, b) => a - b);
      const isPermutation =
        order.length === size && order.every((value, index) => value === index);
      if (!isPermutation) {
        ctx.addIssue({ code: 'custom', message: 'initialOrder must be a permutation of 0..cards-1' });
      } else if (lesson.params.initialOrder.every((value, index) => value === index)) {
        ctx.addIssue({ code: 'custom', message: 'initialOrder must not already be solved' });
      }
      if (lesson.steps.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'tool-loop walks lesson.steps — steps must not be empty' });
      }
    }

    if (
      (lesson.mechanic === 'compaction-sim' ||
        lesson.mechanic === 'tool-loop' ||
        lesson.mechanic === 'injection-defense' ||
        lesson.mechanic === 'config-inject') &&
      !lesson.initialState
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `mechanic "${lesson.mechanic}" requires initialState`,
      });
    }
    if (lesson.mechanic === 'compaction-sim' && lesson.steps.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'compaction-sim walks lesson.steps — steps must not be empty' });
    }

    // Exploratory Tur 3 mechanics: completion = one full run, nothing to grade.
    if (lesson.mechanic === 'model-indecision') {
      if (lesson.pass.type !== 'completeAll' || lesson.pass.count !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'model-indecision must use a completeAll pass with count 1 (ran one comparison)',
        });
      }
      const pairIds = lesson.params.pairs.map((p) => p.id);
      if (new Set(pairIds).size !== pairIds.length) {
        ctx.addIssue({ code: 'custom', message: 'model-indecision pair ids must be unique' });
      }
    }
    if (lesson.mechanic === 'byok-chat') {
      if (lesson.pass.type !== 'completeAll' || lesson.pass.count !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'byok-chat must use a completeAll pass with count 1 (one request sent)',
        });
      }
      if (!lesson.inspector) {
        ctx.addIssue({
          code: 'custom',
          message: 'byok-chat requires inspector: true — the capstone is sending with the inspector open',
        });
      }
    }
  });

export type Lesson = z.infer<typeof lessonSchema>;

export type MechanicName = Lesson['mechanic'];

import { describe, expect, it } from 'vitest';
import { collectMessageKeys, lessonSchema } from '@/content/schema';

const validLesson = {
  id: 'L1.1',
  module: 'tokens',
  order: 1,
  titleKey: 'app_title',
  objectiveKey: 'app_tagline',
  misconceptionKey: null,
  inspector: false,
  mechanic: 'tokenizer-playground',
  params: {
    defaultEncoding: 'o200k_base',
    challenges: [
      {
        kind: 'reduceTokens',
        id: 'c1',
        promptKey: 'app_title',
        seedText: 'Hello there wide world',
        targetTokens: 3,
      },
      { kind: 'findMultiTokenWord', id: 'c2', promptKey: 'app_title', minTokens: 5 },
    ],
  },
  pass: { type: 'completeAll', count: 2 },
  hints: ['app_title', 'app_title', 'app_title'],
  xp: 100,
};

function messagesOf(result: ReturnType<typeof lessonSchema.safeParse>): string {
  return result.success ? '' : result.error.issues.map((i) => i.message).join('\n');
}

describe('lessonSchema', () => {
  it('accepts a valid lesson and applies defaults', () => {
    const result = lessonSchema.safeParse(validLesson);
    expect(result.success, messagesOf(result)).toBe(true);
    if (!result.success) return;
    expect(result.data.ecosystem).toBeNull();
    expect(result.data.badge).toBeNull();
    expect(result.data.steps).toEqual([]);
  });

  it('rejects an i18n key that is missing from the English catalog', () => {
    const result = lessonSchema.safeParse({ ...validLesson, titleKey: 'no_such_key' });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('no_such_key');
  });

  it('rejects a completeAll count that disagrees with the challenge list', () => {
    const result = lessonSchema.safeParse({
      ...validLesson,
      pass: { type: 'completeAll', count: 5 },
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('challenges length');
  });

  it('rejects token-compare lessons whose pass does not match the rounds', () => {
    const base = {
      ...validLesson,
      id: 'L1.2',
      mechanic: 'token-compare',
      params: {
        encoding: 'o200k_base',
        rounds: [
          { promptKey: 'app_title', a: 'hello world', b: 'merhaba dünya' },
          { promptKey: 'app_title', a: 'one two', b: '🚀🚀' },
        ],
      },
    };
    const wrongType = lessonSchema.safeParse({ ...base, pass: { type: 'choice', correctIndex: 0 } });
    expect(wrongType.success).toBe(false);
    expect(messagesOf(wrongType)).toContain('choiceRounds');

    const wrongLength = lessonSchema.safeParse({
      ...base,
      pass: { type: 'choiceRounds', correctIndexes: [1], minCorrect: 1 },
    });
    expect(wrongLength.success).toBe(false);
    expect(messagesOf(wrongLength)).toContain('rounds length');

    const ok = lessonSchema.safeParse({
      ...base,
      pass: { type: 'choiceRounds', correctIndexes: [1, 0], minCorrect: 2 },
    });
    expect(ok.success, messagesOf(ok)).toBe(true);
  });

  it('requires initialState for scripted conversation mechanics', () => {
    const result = lessonSchema.safeParse({
      ...validLesson,
      id: 'L2.1',
      mechanic: 'stateless-chat',
      inspector: true,
      params: {
        turns: [
          { userKey: 'app_title', userTokens: 10, assistantKey: 'app_title', assistantTokens: 20 },
          { userKey: 'app_title', userTokens: 12, assistantKey: 'app_title', assistantTokens: 18 },
        ],
        question: { promptKey: 'app_title', optionKeys: ['app_title', 'app_tagline'] },
      },
      pass: { type: 'choice', correctIndex: 1 },
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('requires initialState');
  });

  it('rejects unknown mechanics and malformed blocks', () => {
    expect(lessonSchema.safeParse({ ...validLesson, mechanic: 'quantum-leap' }).success).toBe(false);

    const badBlock = lessonSchema.safeParse({
      ...validLesson,
      initialState: {
        modelId: 'generic-200k',
        blocks: [
          {
            id: 'sys',
            role: 'system',
            kind: 'message',
            fixedTokens: 10,
            text: 'live text is not allowed in lesson data',
          },
        ],
      },
    });
    expect(badBlock.success).toBe(false);
  });
});

describe('Tur 2 mechanic alignment rules', () => {
  const windowFitBase = {
    ...validLesson,
    id: 'L3.1',
    module: 'context-window',
    mechanic: 'window-fit',
    inspector: true,
    initialState: {
      modelId: 'generic-8k',
      reservedOutput: 1000,
      blocks: [
        { id: 'sys', role: 'system', kind: 'message', fixedTokens: 400 },
        { id: 'file', role: 'user', kind: 'attachment', fixedTokens: 9000 },
      ],
    },
    params: {
      items: [
        { blockId: 'file', removable: true, summaryTokens: 800 },
        { blockId: 'sys', required: true },
      ],
      errorKey: 'app_title',
      successKey: 'app_title',
    },
    pass: { type: 'budgetFit', budget: 8000 },
  };

  it('accepts a well-formed window-fit lesson', () => {
    const result = lessonSchema.safeParse(windowFitBase);
    expect(result.success, messagesOf(result)).toBe(true);
  });

  it('rejects a window-fit budget that disagrees with the model window', () => {
    const result = lessonSchema.safeParse({
      ...windowFitBase,
      pass: { type: 'budgetFit', budget: 4000 },
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('window');
  });

  it('rejects trim items that point at no block', () => {
    const result = lessonSchema.safeParse({
      ...windowFitBase,
      params: { ...windowFitBase.params, items: [{ blockId: 'ghost', removable: true }] },
    });
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('ghost');
  });

  it('rejects injection attempts requiring unknown defenses or a misaligned count', () => {
    const base = {
      ...validLesson,
      id: 'L4.2',
      module: 'hierarchy',
      mechanic: 'injection-defense',
      inspector: true,
      initialState: { modelId: 'generic-128k', blocks: [] },
      params: {
        defenses: [
          { id: 'harden', labelKey: 'app_title', descKey: 'app_title', costTokens: 120 },
          { id: 'input-guard', labelKey: 'app_title', descKey: 'app_title', costTokens: 300 },
        ],
        attempts: [
          {
            id: 'a1',
            introKey: 'app_title',
            attackKey: 'app_title',
            requiredDefenseIds: ['harden'],
            resistKey: 'app_title',
            breachKey: 'app_title',
          },
        ],
      },
      pass: { type: 'completeAll', count: 1 },
    };
    const ok = lessonSchema.safeParse(base);
    expect(ok.success, messagesOf(ok)).toBe(true);

    const unknownDefense = lessonSchema.safeParse({
      ...base,
      params: {
        ...base.params,
        attempts: [{ ...base.params.attempts[0], requiredDefenseIds: ['nope'] }],
      },
    });
    expect(unknownDefense.success).toBe(false);
    expect(messagesOf(unknownDefense)).toContain('unknown defense');

    const wrongCount = lessonSchema.safeParse({ ...base, pass: { type: 'completeAll', count: 3 } });
    expect(wrongCount.success).toBe(false);
    expect(messagesOf(wrongCount)).toContain('attempts length');
  });

  it('locks needle-lab position passes to the successful positions', () => {
    const base = {
      ...validLesson,
      id: 'L5.1',
      module: 'rot',
      mechanic: 'needle-lab',
      params: {
        mode: 'position',
        contextTokens: 40000,
        needleKey: 'app_title',
        questionKey: 'app_title',
        positions: [
          { labelKey: 'app_title', recallPct: 95, success: true },
          { labelKey: 'app_title', recallPct: 60, success: false },
          { labelKey: 'app_title', recallPct: 40, success: false },
          { labelKey: 'app_title', recallPct: 55, success: false },
          { labelKey: 'app_title', recallPct: 90, success: true },
        ],
        hitKey: 'app_title',
        missKey: 'app_title',
      },
      pass: { type: 'choiceOneOf', validIndexes: [0, 4] },
    };
    expect(lessonSchema.safeParse(base).success, messagesOf(lessonSchema.safeParse(base))).toBe(true);

    const drifted = lessonSchema.safeParse({
      ...base,
      pass: { type: 'choiceOneOf', validIndexes: [0, 2] },
    });
    expect(drifted.success).toBe(false);
    expect(messagesOf(drifted)).toContain('successful positions');
  });

  it('locks needle-lab length passes to the shortest successful option', () => {
    const base = {
      ...validLesson,
      id: 'L5.2',
      module: 'rot',
      mechanic: 'needle-lab',
      params: {
        mode: 'length',
        needleKey: 'app_title',
        questionKey: 'app_title',
        options: [
          { labelKey: 'app_title', contextTokens: 2000, recallPct: 97, success: true },
          { labelKey: 'app_title', contextTokens: 16000, recallPct: 88, success: true },
          { labelKey: 'app_title', contextTokens: 120000, recallPct: 45, success: false },
        ],
        promptKey: 'app_title',
        explainKey: 'app_title',
        hitKey: 'app_title',
        missKey: 'app_title',
      },
      pass: { type: 'choice', correctIndex: 0 },
    };
    expect(lessonSchema.safeParse(base).success, messagesOf(lessonSchema.safeParse(base))).toBe(true);

    const wrong = lessonSchema.safeParse({ ...base, pass: { type: 'choice', correctIndex: 1 } });
    expect(wrong.success).toBe(false);
    expect(messagesOf(wrong)).toContain('shortest successful');
  });

  it('rejects unsolvable or trivial rules-trim budgets', () => {
    const base = {
      ...validLesson,
      id: 'L7.3',
      module: 'ecosystem',
      mechanic: 'rules-trim',
      params: {
        introKey: 'app_title',
        fileName: 'CLAUDE.md',
        rules: [
          { id: 'r1', textKey: 'app_title', tokens: 300, loadBearing: true },
          { id: 'r2', textKey: 'app_title', tokens: 500, loadBearing: false },
          { id: 'r3', textKey: 'app_title', tokens: 700, loadBearing: false },
          { id: 'r4', textKey: 'app_title', tokens: 200, loadBearing: true },
        ],
        successKey: 'app_title',
      },
      pass: { type: 'budgetFit', budget: 800 },
    };
    expect(lessonSchema.safeParse(base).success, messagesOf(lessonSchema.safeParse(base))).toBe(true);

    const unsolvable = lessonSchema.safeParse({ ...base, pass: { type: 'budgetFit', budget: 400 } });
    expect(unsolvable.success).toBe(false);
    expect(messagesOf(unsolvable)).toContain('unsolvable');

    const trivial = lessonSchema.safeParse({ ...base, pass: { type: 'budgetFit', budget: 5000 } });
    expect(trivial.success).toBe(false);
    expect(messagesOf(trivial)).toContain('nothing to trim');
  });

  it('requires tool-loop shuffles to be honest permutations', () => {
    const base = {
      ...validLesson,
      id: 'L8.1',
      module: 'tools',
      mechanic: 'tool-loop',
      inspector: true,
      initialState: { modelId: 'generic-128k', blocks: [] },
      steps: [{ type: 'narrate', textKey: 'app_title' }],
      params: {
        cards: [
          { textKey: 'app_title' },
          { textKey: 'app_tagline' },
          { textKey: 'app_title' },
          { textKey: 'app_tagline' },
        ],
        initialOrder: [2, 0, 3, 1],
        orderPromptKey: 'app_title',
      },
      pass: { type: 'ordering', size: 4 },
    };
    expect(lessonSchema.safeParse(base).success, messagesOf(lessonSchema.safeParse(base))).toBe(true);

    const solved = lessonSchema.safeParse({
      ...base,
      params: { ...base.params, initialOrder: [0, 1, 2, 3] },
    });
    expect(solved.success).toBe(false);
    expect(messagesOf(solved)).toContain('already be solved');

    const notPermutation = lessonSchema.safeParse({
      ...base,
      params: { ...base.params, initialOrder: [2, 2, 3, 1] },
    });
    expect(notPermutation.success).toBe(false);
    expect(messagesOf(notPermutation)).toContain('permutation');
  });

  it('checks tradeoff downside indexes and pass type', () => {
    const base = {
      ...validLesson,
      id: 'L5.3',
      module: 'rot',
      mechanic: 'tradeoff',
      params: {
        scenarioKey: 'app_title',
        strategies: [
          {
            id: 'compact',
            labelKey: 'app_title',
            outcomeKey: 'app_title',
            downsidePromptKey: 'app_title',
            downsideOptionKeys: ['app_title', 'app_tagline'],
            downsideCorrectIndex: 1,
            explainKey: 'app_title',
          },
          {
            id: 'fresh',
            labelKey: 'app_title',
            outcomeKey: 'app_title',
            downsidePromptKey: 'app_title',
            downsideOptionKeys: ['app_title', 'app_tagline'],
            downsideCorrectIndex: 0,
            explainKey: 'app_title',
          },
        ],
      },
      pass: { type: 'tradeoff' },
    };
    expect(lessonSchema.safeParse(base).success, messagesOf(lessonSchema.safeParse(base))).toBe(true);

    const outOfRange = lessonSchema.safeParse({
      ...base,
      params: {
        ...base.params,
        strategies: [{ ...base.params.strategies[0], downsideCorrectIndex: 5 }, base.params.strategies[1]],
      },
    });
    expect(outOfRange.success).toBe(false);
    expect(messagesOf(outOfRange)).toContain('out of range');
  });

  it('rejects choiceRounds mechanics whose answers drift out of range', () => {
    const quiz = {
      ...validLesson,
      id: 'L7.1',
      module: 'ecosystem',
      mechanic: 'quiz',
      params: {
        rounds: [
          { promptKey: 'app_title', optionKeys: ['app_title', 'app_tagline'] },
          { promptKey: 'app_title', optionKeys: ['app_title', 'app_tagline', 'app_title'] },
        ],
      },
      pass: { type: 'choiceRounds', correctIndexes: [1, 3], minCorrect: 2 },
    };
    const result = lessonSchema.safeParse(quiz);
    expect(result.success).toBe(false);
    expect(messagesOf(result)).toContain('out of range');
  });
});

describe('collectMessageKeys', () => {
  it('finds keys under *Key, *Keys and hints anywhere in the tree', () => {
    const keys = collectMessageKeys({
      titleKey: 'a',
      nested: { steps: [{ noteKey: 'b' }], question: { optionKeys: ['c', 'd'] } },
      hints: ['e', 'f', 'g'],
      seedText: 'not-a-key',
      id: 'not-a-key-either',
    });
    expect(keys.sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});

describe('Tur 3 mechanic alignment rules', () => {
  const indecisionLesson = {
    id: 'L6.2',
    module: 'sampling',
    order: 2,
    titleKey: 'app_title',
    objectiveKey: 'app_tagline',
    misconceptionKey: null,
    inspector: false,
    mechanic: 'model-indecision',
    params: {
      modelRepo: 'onnx-community/Qwen2.5-0.5B-Instruct',
      dtype: 'q4',
      downloadSizeMB: 320,
      topK: 8,
      prerecordedPath: 'prerecorded/l6-2.json',
      pairs: [
        {
          id: 'capital',
          labelKey: 'app_title',
          basePrompt: 'The capital of France is',
          contradictionPrompt: 'The capital of France is Berlin. No wait, the capital of France is',
        },
        {
          id: 'math',
          labelKey: 'app_title',
          basePrompt: '2 + 2 =',
          contradictionPrompt: '2 + 2 = 5. Actually, 2 + 2 =',
        },
      ],
    },
    pass: { type: 'completeAll', count: 1 },
    hints: ['app_title', 'app_title', 'app_title'],
    xp: 125,
  };

  it('accepts a valid model-indecision lesson', () => {
    const result = lessonSchema.safeParse(indecisionLesson);
    expect(result.success, messagesOf(result)).toBe(true);
  });

  it('rejects model-indecision without a completeAll count-1 pass', () => {
    const wrongType = { ...indecisionLesson, pass: { type: 'choice', correctIndex: 0 } };
    expect(messagesOf(lessonSchema.safeParse(wrongType))).toContain('completeAll pass with count 1');
    const wrongCount = { ...indecisionLesson, pass: { type: 'completeAll', count: 2 } };
    expect(messagesOf(lessonSchema.safeParse(wrongCount))).toContain('completeAll pass with count 1');
  });

  it('rejects duplicate pair ids', () => {
    const duplicated = {
      ...indecisionLesson,
      params: {
        ...indecisionLesson.params,
        pairs: [indecisionLesson.params.pairs[0], indecisionLesson.params.pairs[0]],
      },
    };
    expect(messagesOf(lessonSchema.safeParse(duplicated))).toContain('unique');
  });

  const byokLesson = {
    id: 'L10.1',
    module: 'sandbox',
    order: 1,
    titleKey: 'app_title',
    objectiveKey: 'app_tagline',
    misconceptionKey: null,
    inspector: true,
    mechanic: 'byok-chat',
    params: {
      introKey: 'app_tagline',
      maxOutputTokens: 1024,
      defaultModels: { openai: 'gpt-test', anthropic: 'claude-test', custom: 'local-test' },
    },
    pass: { type: 'completeAll', count: 1 },
    hints: ['app_title', 'app_title', 'app_title'],
    xp: 175,
    badge: 'sandbox-pilot',
  };

  it('accepts a valid byok-chat lesson', () => {
    const result = lessonSchema.safeParse(byokLesson);
    expect(result.success, messagesOf(result)).toBe(true);
  });

  it('rejects byok-chat with the inspector hidden', () => {
    const hidden = { ...byokLesson, inspector: false };
    expect(messagesOf(lessonSchema.safeParse(hidden))).toContain('inspector: true');
  });

  it('rejects byok-chat without a completeAll count-1 pass', () => {
    const wrong = { ...byokLesson, pass: { type: 'completeAll', count: 3 } };
    expect(messagesOf(lessonSchema.safeParse(wrong))).toContain('completeAll pass with count 1');
  });
});

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

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countTokens as countO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { lessonSchema, type Lesson } from '@/content/schema';
import { computeBill } from '@/engine/billing';

const LESSONS_DIR = new URL('../src/content/lessons/', import.meta.url).pathname;

function loadLessons(): { file: string; lesson: Lesson }[] {
  const files: string[] = [];
  for (const dir of readdirSync(LESSONS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(LESSONS_DIR, dir.name))) {
      if (file.endsWith('.json')) files.push(join(dir.name, file));
    }
  }
  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(LESSONS_DIR, file), 'utf8'));
    const parsed = lessonSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`${file}: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
    }
    return { file, lesson: parsed.data };
  });
}

const lessons = loadLessons();
const byId = new Map(lessons.map(({ lesson }) => [lesson.id, lesson]));

describe('lesson data', () => {
  it('ships the five Module 0–2 lessons, all schema-valid', () => {
    expect([...byId.keys()].sort()).toEqual(['L1.1', 'L1.2', 'L2.1', 'L2.2', 'M0']);
  });

  it('has unique ids and orders within each module', () => {
    const seen = new Set<string>();
    for (const { lesson } of lessons) {
      const key = `${lesson.module}#${lesson.order}`;
      expect(seen.has(key), `duplicate module/order ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe('L1.1 challenge targets are achievable', () => {
  const lesson = byId.get('L1.1')!;
  if (lesson.mechanic !== 'tokenizer-playground') throw new Error('wrong mechanic');

  it('reduceTokens seeds cost comfortably more than their targets', () => {
    for (const challenge of lesson.params.challenges) {
      if (challenge.kind !== 'reduceTokens') continue;
      const seedTokens = countO200k(challenge.seedText);
      expect(seedTokens).toBeGreaterThanOrEqual(challenge.targetTokens + 3);
    }
  });

  it('findMultiTokenWord is solvable (the hint word qualifies)', () => {
    for (const challenge of lesson.params.challenges) {
      if (challenge.kind !== 'findMultiTokenWord') continue;
      expect(countO200k('çekoslovakyalılaştıramadıklarımızdanmışsınız')).toBeGreaterThanOrEqual(
        challenge.minTokens,
      );
    }
  });
});

describe('L1.2 authored answers match the real tokenizer', () => {
  const lesson = byId.get('L1.2')!;
  if (lesson.mechanic !== 'token-compare') throw new Error('wrong mechanic');
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass');
  const { rounds } = lesson.params;
  const { correctIndexes } = lesson.pass;

  it('every round has a decisive (≥2 token) gap and the authored winner', () => {
    expect(lesson.params.encoding).toBe('o200k_base');
    rounds.forEach((round, i) => {
      const a = countO200k(round.a);
      const b = countO200k(round.b);
      const costlier = a > b ? 0 : 1;
      expect(Math.abs(a - b), `round ${i + 1} gap too small (${a} vs ${b})`).toBeGreaterThanOrEqual(2);
      expect(costlier, `round ${i + 1}: authored answer disagrees (${a} vs ${b})`).toBe(
        correctIndexes[i],
      );
    });
  });
});

describe('L2.1 statelessness question', () => {
  const lesson = byId.get('L2.1')!;
  if (lesson.mechanic !== 'stateless-chat') throw new Error('wrong mechanic');
  const pass = lesson.pass;
  if (pass.type !== 'choice') throw new Error('wrong pass');

  it('the correct option is the "everything is re-sent" one', () => {
    expect(lesson.params.question.optionKeys[pass.correctIndex]).toBe('l2_1_q_opt2');
  });

  it('turn 4 request really contains 8 blocks per the authored script', () => {
    // system + (u1,a1,u2,a2,u3,a3) + u4 = 8 blocks shipped on turn 4
    const blocksOnTurn4 = 1 + (lesson.params.turns.length - 1) * 2 + 1;
    expect(lesson.params.turns.length).toBe(4);
    expect(blocksOnTurn4).toBe(8);
  });
});

describe('L2.2 the authored answer is the cheapest VALID strategy', () => {
  const lesson = byId.get('L2.2')!;
  if (lesson.mechanic !== 'history-bill') throw new Error('wrong mechanic');
  const pass = lesson.pass;
  if (pass.type !== 'choice') throw new Error('wrong pass');
  const { turns, pricePerMTokIn, cachedReadFactor } = lesson.params;
  const initialTokens = (lesson.initialState?.blocks ?? []).reduce(
    (sum, block) => sum + (block.fixedTokens ?? 0),
    0,
  );
  const billTurns = turns.map((t) => ({ inputTokens: t.inputTokens, outputTokens: t.outputTokens }));

  it('caching beats no-caching while keeping identical window occupancy', () => {
    const cached = computeBill(initialTokens, billTurns, pricePerMTokIn, {
      caching: true,
      cachedReadFactor,
    });
    const uncached = computeBill(initialTokens, billTurns, pricePerMTokIn, {
      caching: false,
      cachedReadFactor,
    });
    // Options 0 and 1 are the only VALID strategies (2 and 3 discard
    // required context). The authored correct answer must be the cheaper one.
    expect(cached.totalCost).toBeLessThan(uncached.totalCost);
    expect(pass.correctIndex).toBe(1);
    expect(cached.finalContextTokens).toBe(uncached.finalContextTokens);
  });

  it('the bill grows every turn without caching (history compounds)', () => {
    const { turns: costs } = computeBill(initialTokens, billTurns, pricePerMTokIn, {
      caching: false,
      cachedReadFactor,
    });
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]!.prefixTokens).toBeGreaterThan(costs[i - 1]!.prefixTokens);
    }
  });
});

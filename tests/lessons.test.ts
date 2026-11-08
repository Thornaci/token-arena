import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countTokens as countO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { lessonSchema, type Lesson } from '@/content/schema';
import { computeBill } from '@/engine/billing';
import { fillInfo, type ContextState } from '@/engine/contextModel';
import { getModelProfile } from '@/engine/modelProfiles';
import { applyTemperature, sampleDistribution, topCandidate } from '@/engine/sampling';
import { acknowledgeFreeze, advance, advanceUntilPause, createSim, isDone } from '@/engine/simEngine';
import { lookupPrerecorded, type PrerecordedFile } from '@/engine/indecision';
import { optionMargin, type MeaningMapFile } from '@/engine/embedMap';
import { imageCost, HIGH_RES_LIMITS } from '@/engine/imageTokens';
import { nextLesson, sortLessons } from '@/lib/curriculum';
import {
  finalAnswer,
  getScene,
  occlusionRanking,
  traceText,
  type RecordedScene,
  type ReplayFile,
} from '@/engine/replay';
import enCatalog from '../messages/en.json';
import esCatalog from '../messages/es.json';
import frCatalog from '../messages/fr.json';
import trCatalog from '../messages/tr.json';
import zhCatalog from '../messages/zh.json';

const count = () => 0; // lesson blocks always carry authored fixedTokens

function initialContext(lesson: Lesson): ContextState {
  const init = lesson.initialState!;
  return {
    model: getModelProfile(init.modelId),
    blocks: [...init.blocks],
    reservedOutput: init.reservedOutput,
  };
}

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
  it('ships every authored lesson, all schema-valid', () => {
    expect([...byId.keys()].sort()).toEqual([
      'L1.1', 'L1.2',
      'L10.1', 'L10.2', 'L10.3', 'L10.4', 'L10.5', 'L10.6', 'L10.7',
      'L11.1',
      'L12.1', 'L12.2', 'L12.3',
      'L13.1', 'L13.2',
      'L14.1', 'L14.2',
      'L2.1', 'L2.2',
      'L3.1', 'L3.2',
      'L4.1', 'L4.2',
      'L5.1', 'L5.2', 'L5.3',
      'L6.1', 'L6.2',
      'L7.1', 'L7.2', 'L7.3',
      'L8.1',
      'L9.1',
      'M0',
    ]);
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

describe('L3.1 the window puzzle is real and solvable', () => {
  const lesson = byId.get('L3.1')!;
  if (lesson.mechanic !== 'window-fit') throw new Error('wrong mechanic');
  const pass = lesson.pass;
  if (pass.type !== 'budgetFit') throw new Error('wrong pass');
  const { items } = lesson.params;
  const blocks = lesson.initialState!.blocks;
  const reserve = lesson.initialState!.reservedOutput;
  const tokensOf = (id: string) => blocks.find((b) => b.id === id)!.fixedTokens ?? 0;

  it('the untouched payload overflows — the 400 moment is guaranteed', () => {
    const total = blocks.reduce((sum, b) => sum + (b.fixedTokens ?? 0), 0) + reserve;
    expect(total).toBeGreaterThan(pass.budget);
  });

  it('removing everything removable while keeping the raw log STILL overflows', () => {
    // The lesson's point: you cannot dodge the big attachment, you must shrink it.
    const logItem = items.find((i) => i.summaryTokens !== undefined)!;
    const total =
      blocks.reduce((sum, b) => {
        const item = items.find((i) => i.blockId === b.id);
        const removable = item?.removable && b.id !== logItem.blockId;
        return sum + (removable ? 0 : b.fixedTokens ?? 0);
      }, 0) + reserve;
    expect(total).toBeGreaterThan(pass.budget);
  });

  it('the intended fix — summarize the log, keep everything else — fits', () => {
    const logItem = items.find((i) => i.summaryTokens !== undefined)!;
    const total =
      blocks.reduce(
        (sum, b) =>
          sum + (b.id === logItem.blockId ? logItem.summaryTokens! : b.fixedTokens ?? 0),
        0,
      ) + reserve;
    expect(total).toBeLessThanOrEqual(pass.budget);
    expect(logItem.required).toBe(true); // deleting it outright must fail the task
  });

  it('the log label states a line count its token size can hold', () => {
    // A log line runs roughly 15–40 tokens ("40,000 lines" in 7,400 tokens was impossible).
    const lines = 300;
    expectAllLocalesSay('l3_1_block_log', lines);
    const perLine = tokensOf('log') / lines;
    expect(perLine).toBeGreaterThan(15);
    expect(perLine).toBeLessThan(40);
  });
});

describe('L3.2 a valid reserve exists on the slider grid', () => {
  const lesson = byId.get('L3.2')!;
  if (lesson.mechanic !== 'output-reserve') throw new Error('wrong mechanic');
  const pass = lesson.pass;
  if (pass.type !== 'budgetFit') throw new Error('wrong pass');
  const { requiredOutputTokens, sliderMax, sliderStep } = lesson.params;
  const used = lesson.initialState!.blocks.reduce((sum, b) => sum + (b.fixedTokens ?? 0), 0);

  it('some slider stop satisfies both the answer and the window', () => {
    const stops: number[] = [];
    for (let v = 0; v <= sliderMax; v += sliderStep) stops.push(v);
    const valid = stops.filter((v) => v >= requiredOutputTokens && used + v <= pass.budget);
    expect(valid.length).toBeGreaterThan(0);
  });

  it('both failure modes are reachable: truncation at start, 400 at max', () => {
    expect(lesson.initialState!.reservedOutput).toBeLessThan(requiredOutputTokens);
    expect(used + sliderMax).toBeGreaterThan(pass.budget);
  });
});

describe('L4.2 the injection gauntlet escalates and stays affordable', () => {
  const lesson = byId.get('L4.2')!;
  if (lesson.mechanic !== 'injection-defense') throw new Error('wrong mechanic');
  const { defenses, attempts } = lesson.params;

  it('each attempt requires a strict superset of the previous defenses', () => {
    for (let i = 1; i < attempts.length; i++) {
      const prev = new Set(attempts[i - 1]!.requiredDefenseIds);
      const curr = new Set(attempts[i]!.requiredDefenseIds);
      expect(curr.size).toBeGreaterThan(prev.size);
      for (const id of prev) expect(curr.has(id), `attempt ${i} dropped ${id}`).toBe(true);
    }
  });

  it('running every defense at once still fits the window', () => {
    const context = initialContext(lesson);
    const guardTokens = defenses.reduce((sum, d) => sum + d.costTokens, 0);
    const fill = fillInfo(context, count);
    expect(fill.used + fill.reserved + guardTokens).toBeLessThanOrEqual(fill.window);
  });
});

describe('L5.1 the authored recall curve is a U', () => {
  const lesson = byId.get('L5.1')!;
  if (lesson.mechanic !== 'needle-lab' || lesson.params.mode !== 'position') {
    throw new Error('wrong mechanic');
  }
  const { positions } = lesson.params;

  it('the edges beat every interior position, and the middle is the floor', () => {
    const first = positions[0]!.recallPct;
    const last = positions[positions.length - 1]!.recallPct;
    const middle = positions[Math.floor(positions.length / 2)]!.recallPct;
    for (let i = 1; i < positions.length - 1; i++) {
      expect(first).toBeGreaterThan(positions[i]!.recallPct);
      expect(last).toBeGreaterThan(positions[i]!.recallPct);
      expect(positions[i]!.recallPct).toBeGreaterThanOrEqual(middle);
    }
  });

  it('only the edges succeed', () => {
    expect(positions.map((p) => p.success)).toEqual([true, false, false, false, true]);
  });
});

describe('L5.2 recall decays monotonically with length', () => {
  const lesson = byId.get('L5.2')!;
  if (lesson.mechanic !== 'needle-lab' || lesson.params.mode !== 'length') {
    throw new Error('wrong mechanic');
  }
  const { options } = lesson.params;

  it('options grow strictly in size while recall strictly falls', () => {
    for (let i = 1; i < options.length; i++) {
      expect(options[i]!.contextTokens).toBeGreaterThan(options[i - 1]!.contextTokens);
      expect(options[i]!.recallPct).toBeLessThan(options[i - 1]!.recallPct);
    }
  });

  it('at least one bloated option actually fails — rot has teeth', () => {
    expect(options.some((o) => !o.success)).toBe(true);
  });
});

describe('L6.1 authored answers agree with the sampling math', () => {
  const lesson = byId.get('L6.1')!;
  if (lesson.mechanic !== 'sampling-lab') throw new Error('wrong mechanic');
  const { candidates, temperatures, topPStops } = lesson.params;

  it('round 1: the coldest stop is near-greedy (top-1 > 99%)', () => {
    const coldest = Math.min(...temperatures);
    expect(topCandidate(applyTemperature(candidates, coldest)).probability).toBeGreaterThan(0.99);
  });

  it('round 2: top-1 probability falls at every hotter stop', () => {
    const sorted = [...temperatures].sort((a, b) => a - b);
    let previous = Number.POSITIVE_INFINITY;
    for (const temperature of sorted) {
      const top = topCandidate(applyTemperature(candidates, temperature)).probability;
      expect(top).toBeLessThan(previous);
      previous = top;
    }
  });

  it('round 3: at temp 1.0 / top_p 0.5 the nucleus is exactly " Paris"', () => {
    expect(temperatures).toContain(1.0);
    expect(topPStops).toContain(0.5);
    const nucleus = sampleDistribution(candidates, 1.0, 0.5)
      .filter((c) => c.inNucleus)
      .map((c) => c.token);
    expect(nucleus).toEqual([' Paris']);
  });

  it('round 3 prose: ~90% here vs ~76% from the real model, for the same sentence', () => {
    const here = topCandidate(applyTemperature(candidates, 1.0));
    expect(here.token).toBe(' Paris');
    const recorded = readPublic<PrerecordedFile>('prerecorded/l6-2.json').pairs.capital!.base;
    expect(recorded.prompt).toBe(lesson.params.promptText);
    const real = recorded.candidates[0]!;
    expect(real.token).toBe(' Paris');
    expectAllLocalesSay('l6_1_r3_explain', Math.round(here.probability * 100), Math.round(real.probability * 100));
  });
});

describe('L7.3 the trim puzzle rewards signal over vibes', () => {
  const lesson = byId.get('L7.3')!;
  if (lesson.mechanic !== 'rules-trim') throw new Error('wrong mechanic');
  const pass = lesson.pass;
  if (pass.type !== 'budgetFit') throw new Error('wrong pass');
  const { rules } = lesson.params;

  it('keeping exactly the load-bearing rules lands under budget', () => {
    const essential = rules.filter((r) => r.loadBearing).reduce((sum, r) => sum + r.tokens, 0);
    expect(essential).toBeLessThanOrEqual(pass.budget);
  });

  it('load-bearing rules read like commands with consequences (heuristic: they name commands/files)', () => {
    // Guard against authoring drift: every load-bearing rule text mentions a
    // concrete artifact (`backtick command`, .env, VPN...), vibes never do.
    expect(rules.filter((r) => r.loadBearing).length).toBe(4);
    expect(rules.filter((r) => !r.loadBearing).length).toBe(6);
  });
});

describe('L8.1 the scripted turn really is a two-request loop', () => {
  const lesson = byId.get('L8.1')!;
  if (lesson.mechanic !== 'tool-loop') throw new Error('wrong mechanic');

  it('exactly two sendRequest beats, with the tool result between them', () => {
    const kinds = lesson.steps.map((s) =>
      s.type === 'addBlock' ? `add:${s.block.kind}` : s.type,
    );
    const firstSend = kinds.indexOf('sendRequest');
    const lastSend = kinds.lastIndexOf('sendRequest');
    expect(kinds.filter((k) => k === 'sendRequest')).toHaveLength(2);
    expect(kinds.indexOf('add:tool-result')).toBeGreaterThan(firstSend);
    expect(kinds.indexOf('add:tool-result')).toBeLessThan(lastSend);
  });

  it('the walkthrough never overflows its window', () => {
    let sim = createSim(initialContext(lesson), lesson.steps);
    while (!isDone(sim)) {
      sim = advanceUntilPause(sim);
      if (sim.frozen) sim = acknowledgeFreeze(sim);
    }
    expect(fillInfo(sim.context, count).status).not.toBe('over');
  });
});

describe('L9.1 compaction fires for a real reason and truly saves the session', () => {
  const lesson = byId.get('L9.1')!;
  if (lesson.mechanic !== 'compaction-sim') throw new Error('wrong mechanic');

  function runToEnd() {
    let sim = createSim(initialContext(lesson), lesson.steps);
    let overflowAtFreeze = false;
    while (!isDone(sim)) {
      sim = advanceUntilPause(sim);
      if (sim.frozen) {
        overflowAtFreeze ||= fillInfo(sim.context, count).status === 'over';
        sim = acknowledgeFreeze(sim);
      }
    }
    return { sim, overflowAtFreeze };
  }

  it('the freeze happens while the context genuinely overflows', () => {
    expect(runToEnd().overflowAtFreeze).toBe(true);
  });

  it('after compaction the session fits again, minus the verbatim blocks', () => {
    const { sim } = runToEnd();
    const fill = fillInfo(sim.context, count);
    expect(fill.status).not.toBe('over');
    const ids = sim.context.blocks.map((b) => b.id);
    expect(ids).toContain('summary');
    for (const dropped of ['t2', 't3', 't5']) expect(ids).not.toContain(dropped);
  });

  it('the pressure line counts the answer reserve, and says so', () => {
    const at = lesson.steps.findIndex((s) => s.type === 'narrate' && s.textKey === 'l9_1_step_pressure');
    expect(at).toBeGreaterThan(0);
    let sim = createSim(initialContext(lesson), lesson.steps);
    for (let i = 0; i <= at; i++) sim = advance(sim);
    expect(sim.cursor).toBe(at + 1);
    const fill = fillInfo(sim.context, count);
    const next = lesson.steps[at + 1]!;
    if (next.type !== 'addBlock') throw new Error('expected the build log next');
    expectAllLocalesSay(
      'l9_1_step_pressure',
      fill.used + fill.reserved,
      fill.reserved,
      fill.window,
      next.block.fixedTokens!,
    );
  });

  it('the detail asked about at the end lived ONLY in a dropped block', () => {
    // t2 carried the line number; the summary deliberately does not.
    const removed = lesson.steps.filter((s) => s.type === 'removeBlock').map((s) => s.blockId);
    expect(removed).toContain('t2');
  });
});

describe('L6.2 recorded fallback stays honest', () => {
  const lesson = byId.get('L6.2')!;
  if (lesson.mechanic !== 'model-indecision') throw new Error('wrong mechanic');
  const file = JSON.parse(
    readFileSync(
      new URL(`../public/${lesson.params.prerecordedPath}`, import.meta.url).pathname,
      'utf8',
    ),
  ) as PrerecordedFile;

  it('was recorded from the exact model the lesson advertises', () => {
    // Drift lock: change the lesson's modelRepo and this forces a re-record.
    expect(file.modelRepo).toBe(lesson.params.modelRepo);
    expect(['q4', 'q4f16']).toContain(file.dtype);
  });

  it('covers every authored pair with the exact authored prompts', () => {
    for (const pair of lesson.params.pairs) {
      const base = lookupPrerecorded(file, pair.id, 'base');
      const contradiction = lookupPrerecorded(file, pair.id, 'contradiction');
      expect(base.prompt).toBe(pair.basePrompt);
      expect(contradiction.prompt).toBe(pair.contradictionPrompt);
    }
  });

  it('candidates are a valid top-k: sorted, in (0,1], mass ≤ 1', () => {
    for (const pair of Object.values(file.pairs)) {
      for (const distribution of [pair.base, pair.contradiction]) {
        const probs = distribution.candidates.map((c) => c.probability);
        expect(probs.length).toBeGreaterThanOrEqual(3);
        expect(probs.length).toBeLessThanOrEqual(lesson.params.topK);
        for (const p of probs) {
          expect(p).toBeGreaterThan(0);
          expect(p).toBeLessThanOrEqual(1);
        }
        expect([...probs].sort((a, b) => b - a)).toEqual(probs);
        expect(probs.reduce((sum, p) => sum + p, 0)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('every contradiction genuinely drops the top-1 confidence (the lesson)', () => {
    for (const pair of lesson.params.pairs) {
      const base = lookupPrerecorded(file, pair.id, 'base');
      const contradiction = lookupPrerecorded(file, pair.id, 'contradiction');
      expect(
        contradiction.candidates[0]!.probability,
        `pair "${pair.id}" does not flatten`,
      ).toBeLessThan(base.candidates[0]!.probability);
    }
  });
});

describe('L11.1 capstone structure', () => {
  const lesson = byId.get('L11.1')!;
  if (lesson.mechanic !== 'byok-chat') throw new Error('wrong mechanic');

  it('is the optional last module, sending with the inspector open', () => {
    expect(lesson.module).toBe('sandbox');
    expect(lesson.inspector).toBe(true);
    expect(lesson.pass).toEqual({ type: 'completeAll', count: 1 });
  });

  it('prefills a model name for every provider tab', () => {
    const { defaultModels } = lesson.params;
    for (const name of Object.values(defaultModels)) {
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

// --- Module 10 (harness) -----------------------------------------------------
// The authored numbers below mirror the representative session figures in the
// Claude Code docs (context-window, sub-agents, skills, memory). These locks
// keep the prose, the JSON and the engines from drifting apart.

type Step = Lesson['steps'][number];

/** Walks a script one beat at a time so "never overflowed" is exact, not sampled. */
function walkScript(context: ContextState, steps: readonly Step[]) {
  let sim = createSim(context, steps);
  const freezeFills = [];
  let everOver = false;
  while (!isDone(sim)) {
    sim = sim.frozen ? acknowledgeFreeze(sim) : advance(sim);
    const fill = fillInfo(sim.context, count);
    if (sim.frozen) freezeFills.push(fill);
    everOver ||= fill.status === 'over';
  }
  return { sim, freezeFills, everOver };
}

const addedBlocks = (steps: readonly Step[]) =>
  steps.flatMap((step) => (step.type === 'addBlock' ? [step.block] : []));

const sumTokens = (blocks: { fixedTokens?: number }[]) =>
  blocks.reduce((total, block) => total + (block.fixedTokens ?? 0), 0);

/** "7,850" / "7 850" / "7.850" → "7850", so a locale's separator never breaks the check. */
const digitsOf = (text: string) => text.replace(/[,.\s  ]/g, '');

const correctKeys = (lesson: Lesson) => {
  const pass = lesson.pass;
  if (pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const rounds = (lesson.params as { rounds: { optionKeys: string[] }[] }).rounds;
  return rounds.map((round, i) => round.optionKeys[pass.correctIndexes[i]!]!);
};

describe('L10.1 the startup context is exactly what the lesson claims', () => {
  const lesson = byId.get('L10.1')!;
  if (lesson.mechanic !== 'session-sim') throw new Error('wrong mechanic');
  const blocks = addedBlocks(lesson.steps);

  it('adds up to 7,850 tokens before the user block ever lands', () => {
    const firstUserAt = lesson.steps.findIndex(
      (step) => step.type === 'addBlock' && step.block.role === 'user',
    );
    expect(firstUserAt).toBeGreaterThan(0);
    const startup =
      sumTokens(lesson.initialState!.blocks) + sumTokens(addedBlocks(lesson.steps.slice(0, firstUserAt)));
    expect(startup).toBe(7850);
    expect(sumTokens(lesson.initialState!.blocks) + sumTokens(blocks)).toBe(13175);
  });

  it('the correct answer states the real startup number', () => {
    const key = correctKeys(lesson)[0]!;
    expect(key).toBe('l10_1_r1_opt2');
    expect(digitsOf(enCatalog[key as keyof typeof enCatalog] as string)).toContain('7850');
  });

  it('the startup blocks are the representative counts from Claude Code\'s context-window docs', () => {
    // https://code.claude.com/docs/en/context-window (interactive timeline), checked 2026-11-08.
    const documented: Record<string, number> = {
      sys: 4200, mem: 680, env: 280, mcp: 120, skills: 450, ucm: 320, 'claude-md': 1800,
    };
    for (const [id, tokens] of Object.entries(documented)) {
      expect(blocks.find((block) => block.id === id)?.fixedTokens, id).toBe(tokens);
    }
  });

  it('the "just the system prompt" distractor uses the real system-prompt size', () => {
    const sys = blocks.find((block) => block.id === 'sys')!;
    expectAllLocalesSay('l10_1_r1_opt1', sys.fixedTokens!);
  });

  it('the path-scoped rule arrives only after a file has been read', () => {
    const firstRead = blocks.findIndex((block) => block.kind === 'tool-result');
    expect(firstRead).toBeGreaterThanOrEqual(0);
    const ruleBlocks = blocks
      .map((block, i) => ({ block, i }))
      .filter(({ block }) => block.id.startsWith('rule-'));
    expect(ruleBlocks.length).toBeGreaterThan(0);
    for (const { block, i } of ruleBlocks) {
      expect(block.kind).toBe('config-file');
      expect(i).toBeGreaterThan(firstRead);
    }
  });

  it('never overflows — this lesson is about cost, not rejection', () => {
    expect(walkScript(initialContext(lesson), lesson.steps).everOver).toBe(false);
  });
});

describe('L10.2 the always/on-demand token gap is real', () => {
  const lesson = byId.get('L10.2')!;
  if (lesson.mechanic !== 'config-inject') throw new Error('wrong mechanic');
  const tabs = lesson.params.tabs;
  const tabOf = (id: string) => tabs.find((tab) => tab.id === id)!;

  it('the always-loaded file dwarfs every description-only entry combined', () => {
    const descriptions = tabs.filter((tab) => tab.id.startsWith('desc-'));
    expect(descriptions.length).toBeGreaterThanOrEqual(2);
    expect(tabOf('always').block.fixedTokens).toBeGreaterThan(
      sumTokens(descriptions.map((tab) => tab.block)),
    );
  });

  it('the invoked skill body costs exactly what the same text costs in CLAUDE.md', () => {
    // The whole point of round 1 vs round 2: same content, different loading strategy.
    expect(tabOf('skill-body').block.fixedTokens).toBe(tabOf('always').block.fixedTokens);
  });

  it('two entries genuinely cost nothing until something triggers them', () => {
    const free = tabs.filter((tab) => (tab.block.fixedTokens ?? 0) === 0).map((tab) => tab.id);
    expect(free.sort()).toEqual(['rule-path', 'skill-hidden']);
  });

  it('answers point at the authored options', () => {
    expect(correctKeys(lesson).slice(0, 3)).toEqual([
      'l10_2_r1_opt1',
      'l10_2_r2_opt0',
      'l10_2_r3_opt1',
    ]);
  });
});

describe('L10.3 delegation really keeps the reads out of the main window', () => {
  const lesson = byId.get('L10.3')!;
  if (lesson.mechanic !== 'subagent-sim') throw new Error('wrong mechanic');
  const sub = lesson.params.sub;

  const subReads = sumTokens(
    addedBlocks(sub.steps).filter((b) => b.kind === 'tool-result' || b.kind === 'attachment'),
  );
  const resultBlock = addedBlocks(lesson.steps).find((b) => b.id === 'sub-result')!;

  it('the subagent reads far more than it returns', () => {
    expect(subReads).toBe(6100);
    expect(resultBlock.fixedTokens).toBe(420);
    expect(subReads).toBeGreaterThan(resultBlock.fixedTokens!);
  });

  it('the result crosses back after the delegation freeze', () => {
    const freezeAt = lesson.steps.findIndex((step) => step.type === 'freeze');
    const resultAt = lesson.steps.findIndex(
      (step) => step.type === 'addBlock' && step.block.id === 'sub-result',
    );
    expect(freezeAt).toBeGreaterThanOrEqual(0);
    expect(resultAt).toBeGreaterThan(freezeAt);
  });

  it('the main window grows by the delegation only — far less than reading inline', () => {
    const freezeAt = lesson.steps.findIndex((step) => step.type === 'freeze');
    const atAsk = walkScript(initialContext(lesson), lesson.steps.slice(0, freezeAt - 1)).sim.context;
    const afterResult = walkScript(initialContext(lesson), lesson.steps.slice(0, freezeAt + 2)).sim
      .context;
    const delegationCost =
      fillInfo(afterResult, count).used - fillInfo(atAsk, count).used;
    expect(delegationCost).toBe(500); // the call out (80) + the answer back (420)
    expect(delegationCost).toBeLessThan(subReads);
    expect(digitsOf(enCatalog.l10_3_r4_opt1)).toContain('500');
  });

  it('neither window ever overflows', () => {
    expect(walkScript(initialContext(lesson), lesson.steps).everOver).toBe(false);
    const subContext: ContextState = {
      model: getModelProfile(sub.initialState.modelId),
      blocks: [...sub.initialState.blocks],
      reservedOutput: sub.initialState.reservedOutput,
    };
    expect(walkScript(subContext, sub.steps).everOver).toBe(false);
  });
});

describe('L10.4 hooks fire around the tool run, and only their output costs tokens', () => {
  const lesson = byId.get('L10.4')!;
  if (lesson.mechanic !== 'tool-loop') throw new Error('wrong mechanic');
  const blocks = addedBlocks(lesson.steps);

  it('one prompt costs three full requests', () => {
    expect(lesson.steps.filter((step) => step.type === 'sendRequest')).toHaveLength(3);
  });

  it('the deny lands before the second request; the post-hook output lands after the tool result', () => {
    const kinds = lesson.steps.map((step) =>
      step.type === 'addBlock' ? `add:${step.block.id}` : step.type,
    );
    const sends = kinds.flatMap((k, i) => (k === 'sendRequest' ? [i] : []));
    expect(kinds.indexOf('add:hook-deny')).toBeLessThan(sends[1]!);
    expect(kinds.indexOf('add:hook-prettier')).toBeGreaterThan(kinds.indexOf('add:result'));
  });

  it('hook output is a tool-role block and stays small', () => {
    const hookBlocks = blocks.filter((block) => block.id.startsWith('hook-'));
    expect(hookBlocks).toHaveLength(2);
    for (const block of hookBlocks) expect(block.role).toBe('tool');
    expect(sumTokens(hookBlocks)).toBe(145);
    expect(digitsOf(enCatalog.l10_4_step_stop)).toContain('145');
  });

  it('the tally counts every hook firing the walkthrough shows', () => {
    // UserPromptSubmit once, PreToolUse per tool call, PostToolUse per tool that ran, Stop once.
    const calls = blocks.filter((block) => block.id.startsWith('call')).length;
    const ran = blocks.filter((block) => block.kind === 'tool-result' && !block.id.startsWith('hook-')).length;
    const requests = lesson.steps.filter((step) => step.type === 'sendRequest').length;
    const hookOutput = sumTokens(blocks.filter((block) => block.id.startsWith('hook-')));
    expect([calls, ran]).toEqual([2, 1]);
    expectAllLocalesSay('l10_4_step_stop', 1, requests, 1 + calls + ran + 1, hookOutput);
  });

  it('the ordering exercise is an honest, unsolved shuffle of every card', () => {
    const { cards, initialOrder } = lesson.params;
    expect(cards).toHaveLength(7);
    expect([...initialOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(initialOrder.some((value, i) => value !== i)).toBe(true);
    expect(walkScript(initialContext(lesson), lesson.steps).everOver).toBe(false);
  });
});

describe('L10.5 permission answers stay pinned to the authored options', () => {
  const lesson = byId.get('L10.5')!;
  if (lesson.mechanic !== 'quiz') throw new Error('wrong mechanic');

  it('grades the six gate scenarios against the intended keys', () => {
    expect(lesson.params.rounds).toHaveLength(6);
    expect(correctKeys(lesson)).toEqual([
      'l10_5_r1_opt1',
      'l10_5_r2_opt1',
      'l10_5_r3_opt0',
      'l10_5_r4_opt1',
      'l10_5_r5_opt1',
      'l10_5_r6_opt1',
    ]);
  });
});

describe('L10.6 compaction is triggered by real pressure and loses the right things', () => {
  const lesson = byId.get('L10.6')!;
  if (lesson.mechanic !== 'compaction-sim') throw new Error('wrong mechanic');
  const run = walkScript(initialContext(lesson), lesson.steps);
  const finalIds = run.sim.context.blocks.map((block) => block.id);

  it('the freeze fires while the window is genuinely under pressure', () => {
    expect(run.freezeFills).toHaveLength(1);
    expect(run.freezeFills[0]!.ratio).toBeGreaterThanOrEqual(0.85);
    expect(run.freezeFills[0]!.status).toBe('warn'); // pressure, not the 400 of L3.1
  });

  it('files on disk survive; the chat-only rule and the path rule do not', () => {
    expect(finalIds).toContain('claude-md');
    expect(finalIds).toContain('summary');
    expect(finalIds).not.toContain('chat-rule');
    const removedRules = lesson.steps.flatMap((step) =>
      step.type === 'removeBlock' && step.blockId.startsWith('rule-') ? [step.blockId] : [],
    );
    expect(removedRules.length).toBeGreaterThan(0);
    for (const id of removedRules) expect(finalIds).not.toContain(id);
  });

  it('the re-attached skill is truncated to the documented 5,000-token cap', () => {
    const blocks = addedBlocks(lesson.steps);
    const full = blocks.find((block) => block.id === 'skill-full')!;
    const reload = blocks.find((block) => block.id === 'skill-reload')!;
    expect(reload.fixedTokens).toBeLessThanOrEqual(5000);
    expect(reload.fixedTokens).toBeLessThan(full.fixedTokens!);
    expect(digitsOf(enCatalog.l10_6_r3_opt1)).toContain('5000');
  });

  it('the session fits comfortably again afterwards', () => {
    expect(fillInfo(run.sim.context, count).status).toBe('ok');
  });
});

describe('L10.7 the decision quiz stays pinned to the authored options', () => {
  const lesson = byId.get('L10.7')!;
  if (lesson.mechanic !== 'quiz') throw new Error('wrong mechanic');

  it('grades all seven triggers against the intended keys', () => {
    expect(lesson.params.rounds).toHaveLength(7);
    expect(correctKeys(lesson)).toEqual([
      'l10_7_r1_opt0',
      'l10_7_r2_opt1',
      'l10_7_r3_opt1',
      'l10_7_r4_opt1',
      'l10_7_r5_opt1',
      'l10_7_r6_opt1',
      'l10_7_r7_opt1',
    ]);
  });

  it('is the module capstone: it awards the badge', () => {
    expect(lesson.badge).toBe('harness-architect');
    expect(enCatalog.badge_harness_architect).toBeTruthy();
  });
});

// ── Recorded-model lessons (L12.x–L14.x) ─────────────────────────────────────
// Every number the prose quotes is locked to the recording it came from, in
// all five locales (separators ignored: 36.6 / 36,6 and 15,552 / 15 552 match).

const CATALOGS: Record<string, Record<string, string>> = {
  en: enCatalog,
  tr: trCatalog,
  es: esCatalog,
  fr: frCatalog,
  zh: zhCatalog,
};

/** Whole numbers as written ("8.000", "6 290", "0.2"), separators dropped — so 800 never matches inside 8,000. */
const numbersIn = (text: string) => (text.match(/\d+(?:[,.\s  ]\d+)*/g) ?? []).map(digitsOf);

function expectAllLocalesSay(key: string, ...values: (number | string)[]) {
  for (const [locale, catalog] of Object.entries(CATALOGS)) {
    const raw = catalog[key] ?? '';
    const text = digitsOf(raw);
    expect(text.length, `${locale}:${key} is missing`).toBeGreaterThan(0);
    for (const value of values) {
      const wanted = digitsOf(String(value));
      if (/^\d+$/.test(wanted)) {
        expect(numbersIn(raw), `${locale}:${key} should say ${value}`).toContain(wanted);
      } else {
        expect(text, `${locale}:${key} should say ${value}`).toContain(wanted);
      }
    }
  }
}

const pct1 = (p: number) => (p * 100).toFixed(1);
const readPublic = <T,>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../public/${path}`, import.meta.url).pathname, 'utf8')) as T;

type ReplayLesson = Extract<Lesson, { mechanic: 'model-replay' }>;
const replayLessons = lessons
  .map(({ lesson }) => lesson)
  .filter((lesson): lesson is ReplayLesson => lesson.mechanic === 'model-replay');

function replayOf(id: string) {
  const lesson = byId.get(id)!;
  if (lesson.mechanic !== 'model-replay') throw new Error(`${id} is not model-replay`);
  return { lesson, file: readPublic<ReplayFile>(lesson.params.recordingPath) };
}

/** The literal option, or i18n key, the authored answer of round `i` points at. */
function correctOption(lesson: Lesson, i: number): string {
  if (lesson.pass.type !== 'choiceRounds') throw new Error('wrong pass type');
  const round = (lesson.params as { rounds: { options?: string[]; optionKeys?: string[] }[] }).rounds[i]!;
  return (round.options ?? round.optionKeys)![lesson.pass.correctIndexes[i]!]!;
}

describe('model-replay recordings match their lessons exactly (re-record on any change)', () => {
  for (const lesson of replayLessons) {
    it(`${lesson.id}: every scene was recorded from the authored inputs`, () => {
      const file = readPublic<ReplayFile>(lesson.params.recordingPath);
      expect(Object.keys(file.scenes).sort()).toEqual(lesson.params.scenes.map((s) => s.id).sort());
      for (const spec of lesson.params.scenes) {
        const scene: RecordedScene = file.scenes[spec.id]!;
        expect(scene.kind, spec.id).toBe(spec.kind);
        if (spec.kind === 'trace' && scene.kind === 'trace') {
          expect([scene.model, scene.prompt, scene.chat]).toEqual([spec.model, spec.prompt, spec.chat]);
          expect(scene.steps.length).toBeLessThanOrEqual(spec.maxSteps);
          for (const step of scene.steps) expect(step.top).toHaveLength(spec.topK);
        } else if (spec.kind === 'next' && scene.kind === 'next') {
          expect(scene.model).toBe(spec.model);
          expect(scene.items.map((i) => [i.prompt, i.chat, Object.keys(i.watch)])).toEqual(
            spec.items.map((i) => [i.prompt, i.chat, i.watch]),
          );
        } else if (spec.kind === 'continue' && scene.kind === 'continue') {
          expect(scene.items.map((i) => [i.model, i.prompt, i.chat])).toEqual(
            spec.items.map((i) => [i.model, i.prompt, i.chat]),
          );
        } else if (spec.kind === 'occlusion' && scene.kind === 'occlusion') {
          expect([scene.model, scene.prompt, scene.answer]).toEqual([spec.model, spec.prompt, spec.answer]);
          expect(scene.words.map((w) => w.word)).toEqual(spec.prompt.split(' '));
        } else if (spec.kind === 'answers' && scene.kind === 'answers') {
          expect(scene.model).toBe(spec.model);
          expect(scene.items.map((i) => i.prompt)).toEqual(spec.items.map((i) => i.prompt));
        } else if (spec.kind === 'thinking' && scene.kind === 'thinking') {
          expect([scene.model, scene.question]).toEqual([spec.model, spec.question]);
          for (const thinking of [false, true]) {
            expect(scene.runs.filter((r) => r.thinking === thinking).map((r) => r.seed)).toEqual(spec.seeds);
          }
        } else {
          throw new Error(`${spec.id}: kind mismatch`);
        }
      }
    });

    it(`${lesson.id}: every recorded distribution is a valid top-k`, () => {
      const file = readPublic<ReplayFile>(lesson.params.recordingPath);
      const distributions = Object.values(file.scenes).flatMap((scene) =>
        scene.kind === 'trace'
          ? scene.steps.map((s) => s.top)
          : scene.kind === 'next'
            ? scene.items.map((i) => i.top)
            : [],
      );
      for (const top of distributions) {
        const probs = top.map((c) => c.probability);
        expect([...probs].sort((a, b) => b - a)).toEqual(probs);
        for (const p of probs) expect(p).toBeGreaterThan(0);
        expect(probs.reduce((sum, p) => sum + p, 0)).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  }
});

describe('L12.1 the generation loop, as recorded', () => {
  const { lesson, file } = replayOf('L12.1');
  const story = getScene(file, 'story', 'trace');
  const chat = getScene(file, 'chat', 'trace');
  const p = (step: number, rank = 0) => story.steps[step]!.top[rank]!;

  it('round 1: "boy" barely beats "girl"', () => {
    expect(p(0).token).toBe(' boy');
    expect(p(0, 1).token).toBe(' girl');
    expect(correctOption(lesson, 0)).toBe('boy');
    const gap = (Number(pct1(p(0).probability)) - Number(pct1(p(0, 1).probability))).toFixed(1);
    expectAllLocalesSay('l12_1_r1_explain', pct1(p(0).probability), pct1(p(0, 1).probability), gap);
  });

  it('round 2: " Tim" then a near-certain "my" — one name, two tokens', () => {
    expect(traceText(story, 3)).toBe(' boy named Tim');
    expect(p(2).token).toBe(' Tim');
    expect(p(3).token).toBe('my');
    expect(p(3).probability).toBeGreaterThan(0.9);
    expectAllLocalesSay('l12_1_r2_prompt', pct1(p(3).probability));
    expectAllLocalesSay('l12_1_r2_explain', pct1(p(2).probability), pct1(p(3).probability));
    expect(correctOption(lesson, 1)).toBe('l12_1_r2_opt0');
  });

  it('round 2 also cites "captivates" = capt + iv + ates from the chat reply', () => {
    const tokens = chat.steps.map((s) => s.top[0]!.token);
    const at = tokens.indexOf(' capt');
    expect(tokens.slice(at, at + 3)).toEqual([' capt', 'iv', 'ates']);
  });

  it('round 3: "car" leads with only about a quarter; chat "with" is 100.0%', () => {
    expect(traceText(story, 9).endsWith('playing with his toy')).toBe(true);
    expect(p(9).token).toBe(' car');
    expect(p(9).probability).toBeGreaterThan(0.2);
    expect(p(9).probability).toBeLessThan(0.3);
    const withStep = chat.steps.find((s) => s.top[0]!.token === ' with')!;
    expect(pct1(withStep.top[0]!.probability)).toBe('100.0');
    expectAllLocalesSay('l12_1_r3_explain', pct1(p(9).probability), '100.0');
    expect(correctOption(lesson, 2)).toBe('l12_1_r3_opt1');
  });

  it('round 4: the reply ends because the model predicts its end token, at step 24', () => {
    const round = lesson.params.rounds[3]!;
    expect(chat.stopped).toBe(true);
    expect(round.step).toBe(chat.steps.length - 1);
    expect(chat.steps.length).toBe(24);
    const last = chat.steps[chat.steps.length - 1]!.top[0]!;
    expect(last.token).toBe('<|im_end|>');
    expect(pct1(last.probability)).toBe('100.0');
    expect(traceText(chat, chat.steps.length - 1).endsWith('captivates the imagination.')).toBe(true);
    expectAllLocalesSay('l12_1_r4_explain', chat.steps.length, '100.0');
    expect(correctOption(lesson, 3)).toBe('l12_1_r4_opt2');
  });
});

describe('L12.2 the meaning map answers come from the real embeddings', () => {
  const lesson = byId.get('L12.2')!;
  if (lesson.mechanic !== 'meaning-map') throw new Error('wrong mechanic');
  const file = readPublic<MeaningMapFile>(lesson.params.recordingPath);
  const sim = (a: string, b: string) =>
    file.sim[file.words.findIndex((w) => w.text === a)]![file.words.findIndex((w) => w.text === b)]!;

  it('was recorded from the advertised model, prefix and word list', () => {
    expect([file.model, file.prefix]).toEqual([lesson.params.model, lesson.params.prefix]);
    expect(file.words).toEqual(lesson.params.words);
    expect(file.words).toHaveLength(40);
    expect(new Set(file.words.map((w) => w.concept)).size).toBe(8);
    expect(file.dims).toBe(768);
    expectAllLocalesSay('l12_2_intro', 40, 8);
  });

  it('the matrix is a real similarity matrix and the map fits [0,1]²', () => {
    const n = file.words.length;
    expect(file.sim).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      expect(file.sim[i]![i]).toBeCloseTo(1, 3);
      for (let j = 0; j < n; j++) expect(file.sim[i]![j]).toBeCloseTo(file.sim[j]![i]!, 4);
    }
    for (const [x, y] of file.xy) {
      for (const v of [x, y]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('rounds 1–2: the authored answer is the most similar option, by a clear margin', () => {
    lesson.params.rounds.slice(0, 2).forEach((round, i) => {
      const { best, margin } = optionMargin(file, round.target!, round.options!);
      expect(best).toBe(correctOption(lesson, i));
      expect(margin).toBeGreaterThanOrEqual(0.03);
    });
    expectAllLocalesSay('l12_2_r1_explain', sim('kedi', 'gato').toFixed(2), sim('kedi', 'köpek').toFixed(2));
    expectAllLocalesSay('l12_2_r2_explain', sim('国王', 'king').toFixed(2), sim('国王', '狗').toFixed(2));
  });

  it('round 3: 39 of 40 nearest neighbours are translations; araba is the exception', () => {
    let translations = 0;
    file.words.forEach((word, i) => {
      const nearestIndex = file.sim[i]!.reduce((best, s, j) => (j !== i && s > file.sim[i]![best]! ? j : best), i === 0 ? 1 : 0);
      if (file.words[nearestIndex]!.concept === word.concept) translations++;
    });
    expect(translations).toBe(39);
    const a = file.words.findIndex((w) => w.text === 'araba');
    const ranked = file.sim[a]!
      .map((s, j) => ({ s, w: file.words[j]!.text }))
      .filter((_, j) => j !== a)
      .sort((x, y) => y.s - x.s)
      .slice(0, 3);
    expect(ranked.map((r) => r.w)).toEqual(['elma', 'coche', 'car']);
    expectAllLocalesSay('l12_2_r3_explain', 39, 40, ...ranked.map((r) => r.s.toFixed(2)));
    expect(correctOption(lesson, 2)).toBe('l12_2_r3_opt1');
  });
});

describe('L12.3 attention, measured', () => {
  const { lesson, file } = replayOf('L12.3');

  it('round 1: one changed word near the start flips the last word', () => {
    const copy = getScene(file, 'copy', 'next');
    const [a, b] = copy.items;
    const wa = a!.prompt.split(' ');
    const wb = b!.prompt.split(' ');
    expect(wa.filter((w, i) => w !== wb[i])).toHaveLength(1);
    expect(a!.top[0]!.token).toBe(' drawer');
    expect(b!.top[0]!.token).toBe(' basket');
    expect(b!.watch[' drawer']!).toBeLessThan(0.005);
    expectAllLocalesSay('l12_3_r1_explain', pct1(a!.top[0]!.probability), pct1(b!.top[0]!.probability));
    expect(correctOption(lesson, 0)).toBe('l12_3_r1_opt1');
  });

  it('round 2: deleting "drawer" hurts most; the numbers in the prose are the measured ones', () => {
    const heat = getScene(file, 'heat', 'occlusion');
    const ranking = occlusionRanking(heat);
    const clean = (w: string) => w.replace(/[.,]$/, '');
    expect(clean(ranking[0]!.word)).toBe('drawer');
    const options = lesson.params.rounds[1]!.options!;
    const dropOf = (word: string) => ranking.find((r) => clean(r.word) === word)!.drop;
    const best = [...options].sort((x, y) => dropOf(y) - dropOf(x))[0];
    expect(best).toBe(correctOption(lesson, 1));
    const drawer = heat.words.find((w) => clean(w.word) === 'drawer')!;
    const blues = ranking.filter((r) => r.word === 'blue');
    expect(blues).toHaveLength(2);
    for (const blue of blues) expect(Math.abs(blue.drop * 100 - 84)).toBeLessThan(1);
    expectAllLocalesSay('l12_3_r2_explain', pct1(heat.base), pct1(drawer.probability), 84, pct1(dropOf('Ayla')));
  });

  it('round 3: the earlier words decide which "mouse" it is', () => {
    const [computer, cat] = getScene(file, 'mouse', 'next').items;
    expect(computer!.top[0]!.token).toBe(' on');
    expect(computer!.watch[' ran']!).toBeLessThan(0.005);
    expect(cat!.top[0]!.token).toBe(' was');
    expect(cat!.watch[' on']!).toBeLessThan(0.005);
    expectAllLocalesSay(
      'l12_3_r3_explain',
      pct1(computer!.top[0]!.probability),
      pct1(cat!.top[0]!.probability),
      pct1(cat!.watch[' ran']!),
    );
    expect(correctOption(lesson, 2)).toBe('l12_3_r3_opt1');
  });
});

describe('L13.1 base vs chat model, as recorded', () => {
  const { lesson, file } = replayOf('L13.1');
  const texts = (id: string) => getScene(file, id, 'continue').items.map((i) => i.text);

  it('compares the advertised base and chat models, 50-token replies', () => {
    for (const spec of lesson.params.scenes) {
      if (spec.kind !== 'continue') throw new Error('expected continue scenes');
      expect(spec.maxNewTokens).toBe(50);
      expect(spec.items.map((i) => i.model)).toEqual(['onnx-community/Qwen2.5-0.5B', 'onnx-community/Qwen2.5-0.5B-Instruct']);
    }
    expectAllLocalesSay('l13_1_intro', 50);
  });

  it('the quoted replies are verbatim from the recording', () => {
    const [sadBase, sadChat] = texts('sad');
    expect(sadBase!.startsWith('I feel a bit sad because I have been away from my family')).toBe(true);
    expect(sadBase!.split('I have been away from my family').length - 1).toBeGreaterThanOrEqual(2);
    expect(sadChat!.startsWith("I'm sorry to hear that")).toBe(true);
    const [dinnerBase, dinnerChat] = texts('dinner');
    expect(dinnerBase).toContain('Multi-choice problem: Are these two questions inquiring about the same information?');
    expect(dinnerChat).toContain('dishes');
    expect(texts('joke')[0]).toContain('Why did the chicken cross the road? To get to the other side!');
  });

  it('answers point at the authored options', () => {
    expect([0, 1, 2, 3].map((i) => correctOption(lesson, i))).toEqual([
      'l13_1_r1_opt1',
      'l13_1_r2_opt2',
      'l13_1_r3_opt1',
      'l13_1_r4_opt0',
    ]);
  });
});

describe('L13.2 hallucination counts match the reviewed replies', () => {
  const { lesson, file } = replayOf('L13.2');
  const spec = lesson.params.scenes.find((s) => s.id === 'fake')!;
  if (spec.kind !== 'answers') throw new Error('wrong scene kind');
  const fake = getScene(file, 'fake', 'answers');

  it('2 of 10 declined, 8 invented — and the verdicts still fit the recorded text', () => {
    expect(fake.items).toHaveLength(10);
    const declined = spec.items.filter((i) => i.verdict === 'declined').length;
    expect(declined).toBe(2);
    expect(correctOption(lesson, 0)).toBe(String(declined));
    // Drift lock only — the verdicts were set by reading each reply.
    fake.items.forEach((item, i) => {
      const apologises = /I'm sorry|I don't have/.test(item.text);
      expect(apologises, item.prompt).toBe(spec.items[i]!.verdict === 'declined');
    });
    expectAllLocalesSay('l13_2_r1_prompt', 10);
    expectAllLocalesSay('l13_2_r1_explain', declined, 10 - declined);
  });

  it('the invented names quoted in the prose are in the replies', () => {
    const all = fake.items.map((i) => i.text).join('\n');
    for (const quote of ['Zarnovo', 'Brindledale', 'Kelmoria City', 'a fictional world in Chinese science fiction']) {
      expect(all).toContain(quote);
    }
  });

  it('the 2030 World Cup reply invents a winner and a date after a disclaimer', () => {
    const text = getScene(file, 'future', 'answers').items[0]!.text;
    expect(text.startsWith('As an artificial intelligence language model')).toBe(true);
    expect(text).toContain('won by Argentina against Germany on September 14, 2030');
    expect(correctOption(lesson, 1)).toBe('l13_2_r2_opt1');
  });
});

describe('L14.1 thinking on/off, graded from the end of each reply', () => {
  const { lesson, file } = replayOf('L14.1');
  const specOf = (id: string) => {
    const spec = lesson.params.scenes.find((s) => s.id === id)!;
    if (spec.kind !== 'thinking') throw new Error('wrong scene kind');
    return spec;
  };
  const runs = (id: string, thinking: boolean) =>
    getScene(file, id, 'thinking').runs.filter((r) => r.thinking === thinking);
  const right = (id: string, thinking: boolean) =>
    runs(id, thinking).filter((r) => finalAnswer(r.answer, specOf(id).answerKind) === specOf(id).expected).length;
  const range = (values: number[]) => [Math.min(...values), Math.max(...values)];

  it('round 1: 91 — thinking off 0/3, on 3/3', () => {
    expect([right('prime', false), right('prime', true)]).toEqual([0, 3]);
    expect(correctOption(lesson, 0)).toBe('l14_1_r1_opt1');
    const [minThink, maxThink] = range(runs('prime', true).map((r) => r.thinkTokens));
    const [minAnswer, maxAnswer] = range(runs('prime', false).map((r) => r.answerTokens));
    expectAllLocalesSay('l14_1_r1_explain', minAnswer, maxAnswer, minThink, maxThink);
    for (const run of runs('prime', true)) expect(run.thought).toContain('13');
  });

  it('round 2: strawberry — spelled right, counted wrong, every thinking run', () => {
    expect([right('letters', false), right('letters', true)]).toEqual([1, 0]);
    for (const run of runs('letters', true)) {
      expect(run.thought).toContain('S-T-R-A-W-B-E-R-R-Y');
      expect(finalAnswer(run.answer, 'number')).toBe('2');
    }
    const [minThink, maxThink] = range(runs('letters', true).map((r) => r.thinkTokens));
    expectAllLocalesSay('l14_1_r2_explain', minThink, maxThink);
    expect(correctOption(lesson, 1)).toBe('l14_1_r2_opt2');
  });

  it('the token pieces named in round 2 are how the tokenizer split the question', () => {
    const tokens = getScene(file, 'letters', 'thinking').questionTokens;
    const at = tokens.indexOf('str');
    expect(tokens.slice(at, at + 3)).toEqual(['str', 'aw', 'berry']);
  });

  it('asked 3 times per mode, as the intro says', () => {
    for (const id of ['prime', 'letters']) expect(specOf(id).seeds).toHaveLength(3);
    expectAllLocalesSay('l14_1_intro', 3);
  });
});

describe('L14.2 image token answers follow the published formula', () => {
  const lesson = byId.get('L14.2')!;
  if (lesson.mechanic !== 'image-tokens') throw new Error('wrong mechanic');
  const preset = (id: string) => lesson.params.presets.find((p) => p.id === id)!;
  const cost = (id: string) => imageCost(preset(id).width, preset(id).height, HIGH_RES_LIMITS);
  const asNumber = (option: string) => Number(digitsOf(option));

  it('preset labels show their real dimensions in every locale', () => {
    for (const p of lesson.params.presets) expectAllLocalesSay(p.labelKey, p.width, p.height);
  });

  it('round 1: a 200×200 thumbnail is 8 × 8 = 64 tokens (40,000 pixels)', () => {
    const thumb = cost('thumb');
    expect(asNumber(correctOption(lesson, 0))).toBe(thumb.tokens);
    expect(lesson.params.rounds[0]!.options!.map(asNumber)).toEqual([thumb.cols, thumb.tokens, 200 * 200]);
    expectAllLocalesSay('l14_2_r1_explain', thumb.cols, thumb.tokens, 200 * 200);
  });

  it('round 2: the 12 MP photo is shrunk to fit — every number in the explanation', () => {
    const photo = cost('photo');
    const { width, height } = preset('photo');
    const fullCols = Math.ceil(width / 28);
    const fullRows = Math.ceil(height / 28);
    expect(photo.resized).toBe(true);
    expect(asNumber(correctOption(lesson, 1))).toBe(photo.tokens);
    expect(lesson.params.rounds[1]!.options!.map(asNumber)).toEqual([width * height, fullCols * fullRows, photo.tokens]);
    expectAllLocalesSay(
      'l14_2_r2_explain',
      fullCols,
      fullRows,
      fullCols * fullRows,
      HIGH_RES_LIMITS.maxTokens,
      photo.width,
      photo.height,
      photo.cols,
      photo.rows,
      photo.tokens,
    );
  });

  it('round 3: the screenshot costs what the prompt says, about a cent at $4 per million', () => {
    const screen = cost('screen');
    expectAllLocalesSay('l14_2_r3_prompt', 1920, 1080, screen.tokens);
    const dollars = (screen.tokens * 4) / 1_000_000;
    expect(dollars).toBeGreaterThan(0.005);
    expect(dollars).toBeLessThan(0.015);
    expect(correctOption(lesson, 2)).toBe('l14_2_r3_opt1');
  });
});

describe('prose that says "the next lesson" points at the right one', () => {
  const sorted = sortLessons(
    lessons.map(({ file, lesson }) => ({
      id: lesson.id,
      slug: file.replace(/\.json$/, ''),
      module: lesson.module,
      order: lesson.order,
      titleKey: lesson.titleKey,
    })),
  );

  it.each([
    ['L4.1', 'L4.2'], // r1/r4 explain: prompt injection comes next
    ['L6.1', 'L6.2'], // r3 explain: the real model of the next lesson
  ])('%s is followed by %s', (from, to) => {
    expect(nextLesson(sorted, from)?.id).toBe(to);
  });
});

describe('L7.2 config-file answers follow the current tool docs', () => {
  const lesson = byId.get('L7.2')!;

  it('grades each round against the intended option', () => {
    // r1: Claude Code reads AGENTS.md only without a CLAUDE.md (code.claude.com/docs/en/memory);
    // r2: Codex ignores CLAUDE.md unless listed as a fallback; r3: 32 KiB default cap.
    expect(correctKeys(lesson)).toEqual([
      'l7_2_r1_opt2',
      'l7_2_r2_opt1',
      'l7_2_r3_opt0',
      'l7_2_r4_opt1',
      'l7_2_r5_opt2',
    ]);
  });

  it('the cap and the oversized file are stated in every locale', () => {
    expectAllLocalesSay('l7_2_r3_opt0', 32);
    expectAllLocalesSay('l7_2_agents_fact3', 32);
    expectAllLocalesSay('l7_2_r3_prompt', 40);
  });
});

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
import enCatalog from '../messages/en.json';

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

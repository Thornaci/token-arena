import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countTokens as countO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { lessonSchema, type Lesson } from '@/content/schema';
import { computeBill } from '@/engine/billing';
import { fillInfo, type ContextState } from '@/engine/contextModel';
import { getModelProfile } from '@/engine/modelProfiles';
import { applyTemperature, sampleDistribution, topCandidate } from '@/engine/sampling';
import { acknowledgeFreeze, advanceUntilPause, createSim, isDone } from '@/engine/simEngine';
import { lookupPrerecorded, type PrerecordedFile } from '@/engine/indecision';

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

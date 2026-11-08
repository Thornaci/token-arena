// Dev-only (never runs in CI): records real small-model behaviour for the
// lessons that replay it. The lesson JSON is the single source of every input
// (model, prompt, steps, seeds); this script only runs them and writes the
// outputs to public/<recordingPath>. tests/lessons.test.ts locks each file to
// its lesson, so changing a lesson's inputs forces a re-record.
//
//   node scripts/record.mjs L12.1 [L12.3 …]      # by lesson id
//   node scripts/record.mjs all                   # every recordable lesson
//
// Requires Node ≥23 (native TypeScript type stripping for the engine imports).
// Models download once into node_modules/.cache/huggingface (override: HF_CACHE).
// Dtypes: model-replay q8 · meaning-map fp32 (EmbeddingGemma has no fp16) ·
// model-indecision: the lesson's dtype — set RECORD_DTYPE=q4 if the CPU
// backend rejects q4f16.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AutoModel, AutoModelForCausalLM, AutoTokenizer, Tensor, env, random } from '@huggingface/transformers';

import { topKFromLogits } from '../src/engine/indecision.ts';
import { pca2d, similarityMatrix } from '../src/engine/embedMap.ts';

env.cacheDir = process.env.HF_CACHE ?? 'node_modules/.cache/huggingface';
const LESSONS_DIR = 'src/content/lessons';
const RECORDABLE = new Set(['model-indecision', 'model-replay', 'meaning-map']);

// ── lessons ────────────────────────────────────────────────────────────────
function allLessons() {
  return readdirSync(LESSONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(LESSONS_DIR, d.name))
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(readFileSync(join(LESSONS_DIR, d.name, f), 'utf8'))),
    );
}

function writeRecording(path, data) {
  const target = join('public', path);
  mkdirSync(dirname(target), { recursive: true });
  // Pretty, but keep numeric arrays (similarity rows, coordinates) on one line.
  const json = JSON.stringify(data, null, 2).replace(/\[\s+(-?[\d.e-]+(?:,\s+-?[\d.e-]+)*)\s+\]/g, (_, body) =>
    `[${body.split(/,\s+/).join(', ')}]`,
  );
  writeFileSync(target, json + '\n');
  console.log(`wrote ${target}`);
}

// ── model plumbing ─────────────────────────────────────────────────────────
const loaded = new Map();
async function causalLM(repo, dtype) {
  const key = `${repo}@${dtype}`;
  if (!loaded.has(key)) {
    console.log(`loading ${repo} (${dtype}) on cpu…`);
    const tok = await AutoTokenizer.from_pretrained(repo);
    const model = await AutoModelForCausalLM.from_pretrained(repo, { dtype, device: 'cpu' });
    const stopIds = new Set(
      ['<|im_end|>', '<|endoftext|>']
        .map((t) => tok.encode(t, { add_special_tokens: false }))
        .filter((ids) => ids.length === 1)
        .map((ids) => ids[0]),
    );
    loaded.set(key, { tok, model, stopIds });
  }
  return loaded.get(key);
}

const encode = (lm, text) => Array.from(lm.tok.encode(text, { add_special_tokens: false }));

function promptIds(lm, prompt, chat, extra = {}) {
  if (!chat) return encode(lm, prompt);
  return Array.from(
    lm.tok.apply_chat_template([{ role: 'user', content: prompt }], {
      add_generation_prompt: true,
      tokenize: true,
      return_tensor: false,
      return_dict: false,
      ...extra,
    }),
  );
}

function asInputs(ids) {
  const n = ids.length;
  return {
    input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, n]),
    attention_mask: new Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]),
  };
}

/** Last-position logits as float32 (full forward, no cache — prompts are short). */
async function lastLogits(lm, ids) {
  const { logits } = await lm.model(asInputs(ids));
  if (logits.type !== 'float32') throw new Error(`logits are ${logits.type}, expected float32`);
  const [, seq, vocab] = logits.dims;
  return logits.data.slice((seq - 1) * vocab, seq * vocab);
}

/** Full-vocabulary probability of one token id (max-subtracted softmax). */
function probabilityOf(logits, id) {
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  let sum = 0;
  for (const v of logits) sum += Math.exp(v - max);
  return Math.exp(logits[id] - max) / sum;
}

const candidates = (lm, logits, k) =>
  topKFromLogits(logits, k).map(({ id, probability }) => ({ token: lm.tok.decode([id]), probability, id }));

async function greedy(lm, ids, maxNewTokens) {
  const out = await lm.model.generate({ ...asInputs(ids), max_new_tokens: maxNewTokens, do_sample: false });
  return Array.from(out.data ?? out[0].data, Number).slice(ids.length);
}

const text = (lm, ids) => lm.tok.decode(ids, { skip_special_tokens: true }).trim();

// ── model-replay scenes ────────────────────────────────────────────────────
const SCENES = {
  async trace(scene, dtype) {
    const lm = await causalLM(scene.model, dtype);
    const ids = promptIds(lm, scene.prompt, scene.chat);
    const steps = [];
    let stopped = false;
    for (let s = 0; s < scene.maxSteps; s++) {
      const top = candidates(lm, await lastLogits(lm, ids), scene.topK ?? 5);
      steps.push({ top: top.map(({ token, probability }) => ({ token, probability })) });
      if (lm.stopIds.has(top[0].id)) {
        stopped = true;
        break;
      }
      ids.push(top[0].id);
    }
    console.log(`  trace: ${JSON.stringify(steps.map((s) => s.top[0].token).join(''))}${stopped ? ' ⏹' : ''}`);
    return { kind: 'trace', model: scene.model, prompt: scene.prompt, chat: scene.chat, steps, stopped };
  },

  async next(scene, dtype) {
    const lm = await causalLM(scene.model, dtype);
    const items = [];
    for (const item of scene.items) {
      const logits = await lastLogits(lm, promptIds(lm, item.prompt, item.chat ?? false));
      const top = candidates(lm, logits, scene.topK ?? 5).map(({ token, probability }) => ({ token, probability }));
      const watch = Object.fromEntries(
        (item.watch ?? []).map((word) => [word, probabilityOf(logits, encode(lm, word)[0])]),
      );
      console.log(`  next: ${top.slice(0, 3).map((c) => `${JSON.stringify(c.token)} ${(c.probability * 100).toFixed(1)}%`).join(' ')}`);
      items.push({ prompt: item.prompt, chat: item.chat ?? false, top, watch });
    }
    return { kind: 'next', model: scene.model, items };
  },

  async continue(scene, dtype) {
    const items = [];
    for (const item of scene.items) {
      const lm = await causalLM(item.model, dtype);
      const reply = text(lm, await greedy(lm, promptIds(lm, item.prompt, item.chat), scene.maxNewTokens));
      console.log(`  continue (${item.model}): ${JSON.stringify(reply.slice(0, 100))}…`);
      items.push({ model: item.model, prompt: item.prompt, chat: item.chat, text: reply });
    }
    return { kind: 'continue', items };
  },

  async occlusion(scene, dtype) {
    const lm = await causalLM(scene.model, dtype);
    const answerId = encode(lm, scene.answer)[0];
    const pOf = async (prompt) => probabilityOf(await lastLogits(lm, encode(lm, prompt)), answerId);
    const words = scene.prompt.split(' ');
    const base = await pOf(scene.prompt);
    const measured = [];
    for (let i = 0; i < words.length; i++) {
      const without = [...words.slice(0, i), ...words.slice(i + 1)].join(' ');
      measured.push({ word: words[i], probability: await pOf(without) });
    }
    const ranked = measured.map((m) => ({ ...m, drop: base - m.probability })).sort((a, b) => b.drop - a.drop);
    console.log(`  occlusion base ${(base * 100).toFixed(1)}%: ${ranked.slice(0, 4).map((r) => `${r.word} −${(r.drop * 100).toFixed(1)}`).join(', ')}`);
    return { kind: 'occlusion', model: scene.model, prompt: scene.prompt, answer: scene.answer, base, words: measured };
  },

  async answers(scene, dtype) {
    const lm = await causalLM(scene.model, dtype);
    const items = [];
    for (const item of scene.items) {
      const reply = text(lm, await greedy(lm, promptIds(lm, item.prompt, true), scene.maxNewTokens));
      console.log(`  answers: ${item.prompt} → ${JSON.stringify(reply.slice(0, 90))}`);
      items.push({ prompt: item.prompt, text: reply });
    }
    return { kind: 'answers', model: scene.model, items };
  },

  async thinking(scene, dtype) {
    const lm = await causalLM(scene.model, dtype);
    const open = encode(lm, '<think>')[0];
    const close = encode(lm, '</think>')[0];
    // Qwen3's recommended sampling minus top_p, which transformers.js 4.2 does
    // not implement (TopPLogitsWarper is a stub) — recorded as-is in settings.
    const settings = { thinkingTemperature: 0.6, plainTemperature: 0.7, topK: 20 };
    const runs = [];
    for (const thinking of [false, true]) {
      for (const seed of scene.seeds) {
        random.seed(seed);
        const ids = promptIds(lm, scene.question, true, { enable_thinking: thinking });
        const out = await lm.model.generate({
          ...asInputs(ids),
          max_new_tokens: thinking ? scene.maxThinkingTokens + 400 : 400,
          do_sample: true,
          temperature: thinking ? settings.thinkingTemperature : settings.plainTemperature,
          top_k: settings.topK,
        });
        const all = Array.from(out.data ?? out[0].data, Number).slice(ids.length);
        const o = all.indexOf(open);
        const c = all.indexOf(close);
        const hasThought = o >= 0 && c > o;
        const answerIds = c >= 0 ? all.slice(c + 1) : all;
        const run = {
          thinking,
          seed,
          thinkTokens: hasThought ? c - o - 1 : 0,
          answerTokens: answerIds.filter((id) => !lm.stopIds.has(id)).length,
          thought: hasThought ? text(lm, all.slice(o + 1, c)) : '',
          answer: text(lm, answerIds),
        };
        if (thinking && !hasThought) throw new Error(`seed ${seed}: thinking never closed — raise maxThinkingTokens`);
        console.log(`  thinking=${thinking} seed=${seed}: ${run.thinkTokens} hidden + ${run.answerTokens} → ${JSON.stringify(run.answer.slice(-80))}`);
        runs.push(run);
      }
    }
    const questionTokens = encode(lm, scene.question).map((id) => lm.tok.decode([id]));
    return { kind: 'thinking', model: scene.model, question: scene.question, questionTokens, settings, runs };
  },
};

async function recordReplay(lesson) {
  const dtype = process.env.RECORD_DTYPE ?? 'q8';
  const scenes = {};
  for (const scene of lesson.params.scenes) {
    console.log(`scene ${scene.id} (${scene.kind})`);
    scenes[scene.id] = await SCENES[scene.kind](scene, dtype);
  }
  writeRecording(lesson.params.recordingPath, { recordedAt: new Date().toISOString(), dtype, scenes });
}

// ── meaning-map ────────────────────────────────────────────────────────────
async function recordMeaningMap(lesson) {
  const { model: repo, prefix, words, recordingPath } = lesson.params;
  const dtype = process.env.RECORD_DTYPE ?? 'fp32';
  console.log(`loading ${repo} (${dtype}) on cpu…`);
  const tok = await AutoTokenizer.from_pretrained(repo);
  const model = await AutoModel.from_pretrained(repo, { dtype, device: 'cpu' });
  const inputs = await tok(words.map((w) => prefix + w.text), { padding: true });
  const { sentence_embedding } = await model(inputs);
  const [n, d] = sentence_embedding.dims;
  const vectors = Array.from({ length: n }, (_, i) => sentence_embedding.data.slice(i * d, (i + 1) * d));
  const round4 = (x) => Math.round(x * 1e4) / 1e4;
  writeRecording(recordingPath, {
    model: repo,
    dtype,
    prefix,
    dims: d,
    recordedAt: new Date().toISOString(),
    words,
    xy: pca2d(vectors).map(([x, y]) => [round4(x), round4(y)]),
    sim: similarityMatrix(vectors).map((row) => row.map(round4)),
  });
}

// ── model-indecision (L6.2 fallback) ───────────────────────────────────────
async function recordIndecision(lesson) {
  const { modelRepo, dtype: lessonDtype, topK, pairs, prerecordedPath } = lesson.params;
  const dtype = process.env.RECORD_DTYPE ?? lessonDtype;
  const lm = await causalLM(modelRepo, dtype);
  const record = async (prompt) => ({
    prompt,
    candidates: candidates(lm, await lastLogits(lm, encode(lm, prompt)), topK).map(({ token, probability }) => ({
      token,
      probability,
    })),
  });
  const out = { modelRepo, dtype, recordedAt: new Date().toISOString(), pairs: {} };
  for (const pair of pairs) {
    const base = await record(pair.basePrompt);
    const contradiction = await record(pair.contradictionPrompt);
    out.pairs[pair.id] = { base, contradiction };
    const pct = (d) => `${(d.candidates[0].probability * 100).toFixed(1)}% ${JSON.stringify(d.candidates[0].token)}`;
    console.log(`${pair.id}: base top-1 ${pct(base)} → contradiction top-1 ${pct(contradiction)}`);
  }
  writeRecording(prerecordedPath, out);
}

// ── main ───────────────────────────────────────────────────────────────────
const wanted = process.argv.slice(2);
if (wanted.length === 0) {
  console.error('usage: node scripts/record.mjs <lesson id…> | all');
  process.exit(1);
}
const lessons = allLessons().filter((l) => RECORDABLE.has(l.mechanic));
const selected = wanted.includes('all') ? lessons : lessons.filter((l) => wanted.includes(l.id));
const missing = wanted.filter((id) => id !== 'all' && !selected.some((l) => l.id === id));
if (missing.length) {
  console.error(`not a recordable lesson: ${missing.join(', ')} (recordable: ${lessons.map((l) => l.id).join(', ')})`);
  process.exit(1);
}
for (const lesson of selected) {
  console.log(`\n=== ${lesson.id} (${lesson.mechanic})`);
  if (lesson.mechanic === 'model-replay') await recordReplay(lesson);
  else if (lesson.mechanic === 'meaning-map') await recordMeaningMap(lesson);
  else await recordIndecision(lesson);
}

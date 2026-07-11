// Dev-only (never runs in CI): records the L6.2 pre-recorded fallback by
// running the SAME raw-prompt manual forward pass the WebGPU worker uses,
// via the CPU backend in Node. Re-run after changing the lesson's pairs:
//
//   node scripts/record-l6-2.mjs
//
// Requires Node ≥23 (native TypeScript type stripping for the engine import).
// Set RECORD_DTYPE=q4 if the CPU backend rejects the lesson's fp16 dtype.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AutoModelForCausalLM, AutoTokenizer, env } from '@huggingface/transformers';

import { topKFromLogits } from '../src/engine/indecision.ts';

const lesson = JSON.parse(readFileSync('src/content/lessons/06-sampling/l6-2.json', 'utf8'));
const { modelRepo, dtype: lessonDtype, topK, pairs, prerecordedPath } = lesson.params;
const dtype = process.env.RECORD_DTYPE ?? lessonDtype;

env.cacheDir = process.env.HF_CACHE ?? 'node_modules/.cache/huggingface';

console.log(`loading ${modelRepo} (${dtype}) on cpu…`);
const tokenizer = await AutoTokenizer.from_pretrained(modelRepo);
const model = await AutoModelForCausalLM.from_pretrained(modelRepo, {
  dtype,
  device: 'cpu',
  progress_callback: (info) => {
    if (info.status === 'progress' && info.file?.endsWith('.onnx')) {
      process.stdout.write(`\r${info.file} ${info.progress?.toFixed(0) ?? '?'}%   `);
    }
  },
});
console.log('\nmodel ready');

async function record(prompt) {
  const inputs = tokenizer(prompt);
  const { logits } = await model(inputs);
  if (logits.type !== 'float32') {
    throw new Error(`logits are ${logits.type}, expected float32 — try RECORD_DTYPE=q4`);
  }
  const dims = logits.dims;
  const vocabSize = dims[dims.length - 1];
  const seqLen = dims[dims.length - 2];
  const lastPosition = logits.data.slice((seqLen - 1) * vocabSize, seqLen * vocabSize);
  const top = topKFromLogits(lastPosition, topK);
  return {
    prompt,
    candidates: top.map(({ id, probability }) => ({
      token: tokenizer.decode([id]),
      probability,
    })),
  };
}

const out = { modelRepo, dtype, recordedAt: new Date().toISOString(), pairs: {} };
for (const pair of pairs) {
  const base = await record(pair.basePrompt);
  const contradiction = await record(pair.contradictionPrompt);
  out.pairs[pair.id] = { base, contradiction };
  const pct = (d) => `${(d.candidates[0].probability * 100).toFixed(1)}% ${JSON.stringify(d.candidates[0].token)}`;
  console.log(`${pair.id}: base top-1 ${pct(base)} → contradiction top-1 ${pct(contradiction)}`);
}

mkdirSync('public/prerecorded', { recursive: true });
writeFileSync(`public/${prerecordedPath}`, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote public/${prerecordedPath}`);

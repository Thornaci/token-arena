/// <reference lib="webworker" />
import { AutoModelForCausalLM, AutoTokenizer } from '@huggingface/transformers';

import {
  topKFromLogits,
  type Distribution,
  type WorkerRequest,
  type WorkerResponse,
} from '@/engine/indecision';

/**
 * The only file in the app that imports @huggingface/transformers — it must
 * stay that way so the multi-MB runtime ships exclusively in this worker
 * chunk, fetched after the user consents. The worker is a thin shell: all
 * math and message validation lives in src/engine/indecision.ts.
 *
 * Inference is a single manual forward pass over the RAW prompt (no chat
 * template): `model(inputs)` exposes the logits that .generate() hides, and
 * the raw-continuation framing matches L6.1's "what comes next" setup.
 */

type LoadedModel = {
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>>;
};

let loaded: Promise<LoadedModel> | null = null;
let topK = 8;

const post = (message: WorkerResponse) => self.postMessage(message);

async function load(modelRepo: string, dtype: 'q4' | 'q4f16'): Promise<LoadedModel> {
  const tokenizer = await AutoTokenizer.from_pretrained(modelRepo);
  const model = await AutoModelForCausalLM.from_pretrained(modelRepo, {
    device: 'webgpu',
    dtype,
    progress_callback: (info) => {
      const p = info as { status?: string; progress?: number; file?: string };
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'progress', pct: p.progress, file: p.file ?? '' });
      }
    },
  });
  return { tokenizer, model };
}

async function infer(prompt: string): Promise<Distribution> {
  const { tokenizer, model } = await (loaded ??
    Promise.reject(new Error('worker received infer before init')));
  const inputs = tokenizer(prompt);
  const { logits } = await model(inputs);
  const dims = logits.dims as number[];
  const vocabSize = dims[dims.length - 1]!;
  const seqLen = dims[dims.length - 2]!;
  const data = logits.data as Float32Array;
  const lastPosition = data.slice((seqLen - 1) * vocabSize, seqLen * vocabSize);
  const top = topKFromLogits(lastPosition, topK);
  return {
    prompt,
    candidates: top.map(({ id, probability }) => ({
      token: tokenizer.decode([id]),
      probability,
    })),
  };
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    topK = message.topK;
    loaded ??= load(message.modelRepo, message.dtype);
    try {
      await loaded;
      post({ type: 'ready' });
    } catch (error) {
      loaded = null;
      post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }
  if (message.type === 'infer') {
    try {
      const distribution = await infer(message.prompt);
      post({ type: 'result', requestId: message.requestId, distribution });
    } catch (error) {
      post({
        type: 'error',
        requestId: message.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

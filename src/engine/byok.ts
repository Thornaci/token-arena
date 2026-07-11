import type { ContextBlock, CountFn } from '@/engine/contextModel';

/**
 * L10.1 BYO-key sandbox — the pure half. Builds provider requests and parses
 * responses without ever calling fetch, so every URL, header, and payload
 * shape is unit-testable. The mechanic component owns the actual network call.
 *
 * The user's API key exists only in memory (and, if they opt in, in the
 * separate `ta:byok` localStorage key) and is sent to nobody but the chosen
 * provider. Anything rendered to the page goes through redactedHeaders().
 */

export type ByokProvider = 'openai' | 'anthropic' | 'custom';

export interface ByokConfig {
  provider: ByokProvider;
  apiKey: string;
  model: string;
  /** OpenAI-compatible base URL, only used when provider === 'custom'. */
  baseUrl?: string;
  maxOutputTokens: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ByokRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Normalizes a pasted OpenAI-compatible base URL: trailing slashes go, and a
 * missing `/v1` is appended (users paste both `https://openrouter.ai/api` and
 * `http://localhost:1234/v1`).
 */
export function normalizeBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  if (!/\/v1$/.test(base)) base = `${base}/v1`;
  return base;
}

export function buildByokRequest(config: ByokConfig, messages: ChatMessage[]): ByokRequest {
  if (config.provider === 'anthropic') {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const rest = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));
    return {
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        // Required for CORS from a static site; the "danger" is shipping a key
        // in frontend code — here the key is the user's own, entered by hand.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: {
        model: config.model,
        max_tokens: config.maxOutputTokens,
        ...(system.length > 0 ? { system } : {}),
        messages: rest,
      },
    };
  }
  const base =
    config.provider === 'custom' && config.baseUrl
      ? normalizeBaseUrl(config.baseUrl)
      : 'https://api.openai.com/v1';
  return {
    url: `${base}/chat/completions`,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    // No token cap: OpenAI-compatible servers disagree on its name
    // (max_tokens vs max_completion_tokens); omitting it works everywhere.
    body: {
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
  };
}

export interface ByokUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ParsedByokResponse {
  text: string;
  usage: ByokUsage;
}

/** Throws with a short reason when the response body has an unexpected shape. */
export function parseByokResponse(provider: ByokProvider, json: unknown): ParsedByokResponse {
  if (typeof json !== 'object' || json === null) throw new Error('response is not an object');
  const body = json as Record<string, unknown>;
  if (provider === 'anthropic') {
    if (!Array.isArray(body.content)) throw new Error('response has no content array');
    const text = body.content
      .filter(
        (block: unknown): block is { type: string; text: string } =>
          typeof block === 'object' &&
          block !== null &&
          (block as Record<string, unknown>).type === 'text' &&
          typeof (block as Record<string, unknown>).text === 'string',
      )
      .map((block) => block.text)
      .join('');
    const usage = (body.usage ?? {}) as Record<string, unknown>;
    return {
      text,
      usage: {
        ...(typeof usage.input_tokens === 'number' ? { inputTokens: usage.input_tokens } : {}),
        ...(typeof usage.output_tokens === 'number' ? { outputTokens: usage.output_tokens } : {}),
      },
    };
  }
  const choices = body.choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error('response has no choices');
  const message = (choices[0] as Record<string, unknown>).message;
  const content =
    typeof message === 'object' && message !== null
      ? (message as Record<string, unknown>).content
      : undefined;
  if (typeof content !== 'string') throw new Error('response has no message content');
  const usage = (body.usage ?? {}) as Record<string, unknown>;
  return {
    text: content,
    usage: {
      ...(typeof usage.prompt_tokens === 'number' ? { inputTokens: usage.prompt_tokens } : {}),
      ...(typeof usage.completion_tokens === 'number'
        ? { outputTokens: usage.completion_tokens }
        : {}),
    },
  };
}

/** Inspector label keys per chat role (must exist in every message catalog). */
export const BYOK_BLOCK_LABEL_KEYS: Record<ChatMessage['role'], string> = {
  system: 'byok_block_system',
  user: 'byok_block_user',
  assistant: 'byok_block_assistant',
};

/**
 * Maps the outgoing payload onto Context Inspector blocks. Token counts are
 * precomputed with the injected counter (o200k in the mechanic) — blocks with
 * raw `text` would fall back to the inspector's rough len/4 estimate.
 */
export function payloadBlocks(messages: ChatMessage[], count: CountFn): ContextBlock[] {
  return messages.map((message, index) => ({
    id: `byok-${index}`,
    role: message.role,
    kind: 'message',
    labelKey: BYOK_BLOCK_LABEL_KEYS[message.role],
    fixedTokens: count(message.content),
  }));
}

export interface ByokPrices {
  /** User-entered price per 1M input tokens, in their own currency. */
  inPerMTok: number;
  /** User-entered price per 1M output tokens. */
  outPerMTok: number;
}

export function estimateCost(usage: ByokUsage, prices: ByokPrices): number {
  return (
    ((usage.inputTokens ?? 0) * prices.inPerMTok + (usage.outputTokens ?? 0) * prices.outPerMTok) /
    1_000_000
  );
}

const SECRET_HEADERS = new Set(['authorization', 'x-api-key']);

/** Masks credential headers for the payload viewer; safe to render. */
export function redactedHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (SECRET_HEADERS.has(name.toLowerCase())) {
      const prefix = value.startsWith('Bearer ') ? 'Bearer ' : '';
      const secret = prefix ? value.slice(prefix.length) : value;
      redacted[name] = `${prefix}${secret.slice(0, 3)}••••••••`;
    } else {
      redacted[name] = value;
    }
  }
  return redacted;
}

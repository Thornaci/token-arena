import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanTestStorage, useTestStorageEngine } from '@nanostores/persistent';

import {
  ANTHROPIC_VERSION,
  buildByokRequest,
  estimateCost,
  normalizeBaseUrl,
  parseByokResponse,
  payloadBlocks,
  redactedHeaders,
  type ByokConfig,
  type ChatMessage,
} from '@/engine/byok';
import { BYOK_STORAGE_KEY, clearStoredByok, loadStoredByok, saveStoredByok } from '@/stores/byok';
import { completeLevel, exportProgress, resetProgress } from '@/stores/progress';

const KEY = 'sk-test-not-a-real-key-1234567890';

const config = (overrides: Partial<ByokConfig> = {}): ByokConfig => ({
  provider: 'openai',
  apiKey: KEY,
  model: 'gpt-test',
  maxOutputTokens: 512,
  ...overrides,
});

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'Be terse.' },
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hi.' },
  { role: 'user', content: 'What is a token?' },
];

describe('buildByokRequest — openai', () => {
  it('targets the official endpoint with a Bearer header', () => {
    const request = buildByokRequest(config(), MESSAGES);
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(request.headers['content-type']).toBe('application/json');
    expect(request.body).toEqual({
      model: 'gpt-test',
      messages: MESSAGES.map((m) => ({ role: m.role, content: m.content })),
    });
  });

  it('sends no token cap — OpenAI-compatible servers disagree on its name', () => {
    const request = buildByokRequest(config(), MESSAGES);
    expect(request.body).not.toHaveProperty('max_tokens');
    expect(request.body).not.toHaveProperty('max_completion_tokens');
  });
});

describe('buildByokRequest — anthropic', () => {
  const request = buildByokRequest(config({ provider: 'anthropic' }), MESSAGES);

  it('targets /v1/messages with the CORS-enabling headers', () => {
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.headers['x-api-key']).toBe(KEY);
    expect(request.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(request.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(request.headers.authorization).toBeUndefined();
  });

  it('lifts system messages out of the array into the system field', () => {
    expect(request.body.system).toBe('Be terse.');
    expect(request.body.messages).toEqual([
      { role: 'user', content: 'Hello!' },
      { role: 'assistant', content: 'Hi.' },
      { role: 'user', content: 'What is a token?' },
    ]);
    expect(request.body.max_tokens).toBe(512);
  });

  it('omits the system field when there is no system message', () => {
    const noSystem = buildByokRequest(config({ provider: 'anthropic' }), MESSAGES.slice(1));
    expect(noSystem.body).not.toHaveProperty('system');
  });
});

describe('buildByokRequest — custom endpoint', () => {
  it.each([
    ['https://openrouter.ai/api', 'https://openrouter.ai/api/v1/chat/completions'],
    ['https://openrouter.ai/api/', 'https://openrouter.ai/api/v1/chat/completions'],
    ['http://localhost:1234/v1', 'http://localhost:1234/v1/chat/completions'],
    ['http://localhost:11434/v1/', 'http://localhost:11434/v1/chat/completions'],
  ])('normalizes %s', (baseUrl, expected) => {
    const request = buildByokRequest(config({ provider: 'custom', baseUrl }), MESSAGES);
    expect(request.url).toBe(expected);
  });

  it('falls back to the OpenAI endpoint when no baseUrl is set', () => {
    const request = buildByokRequest(config({ provider: 'custom' }), MESSAGES);
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('exposes normalizeBaseUrl for the UI hint', () => {
    expect(normalizeBaseUrl(' https://example.com// ')).toBe('https://example.com/v1');
  });
});

describe('parseByokResponse', () => {
  it('parses an OpenAI-shaped body with usage', () => {
    const parsed = parseByokResponse('openai', {
      choices: [{ message: { role: 'assistant', content: 'A token is…' } }],
      usage: { prompt_tokens: 42, completion_tokens: 12 },
    });
    expect(parsed).toEqual({ text: 'A token is…', usage: { inputTokens: 42, outputTokens: 12 } });
  });

  it('parses an Anthropic-shaped body, joining text blocks', () => {
    const parsed = parseByokResponse('anthropic', {
      content: [
        { type: 'text', text: 'A token ' },
        { type: 'text', text: 'is…' },
      ],
      usage: { input_tokens: 40, output_tokens: 11 },
    });
    expect(parsed).toEqual({ text: 'A token is…', usage: { inputTokens: 40, outputTokens: 11 } });
  });

  it('tolerates missing usage', () => {
    expect(
      parseByokResponse('openai', { choices: [{ message: { content: 'hi' } }] }).usage,
    ).toEqual({});
  });

  it('throws a short reason on malformed bodies', () => {
    expect(() => parseByokResponse('openai', null)).toThrow(/not an object/);
    expect(() => parseByokResponse('openai', { choices: [] })).toThrow(/no choices/);
    expect(() => parseByokResponse('openai', { choices: [{ message: {} }] })).toThrow(/content/);
    expect(() => parseByokResponse('anthropic', { usage: {} })).toThrow(/content array/);
  });
});

describe('payloadBlocks', () => {
  it('maps messages to inspector blocks with injected token counts', () => {
    const blocks = payloadBlocks(MESSAGES, (text) => text.length);
    expect(blocks).toHaveLength(4);
    expect(blocks[0]).toEqual({
      id: 'byok-0',
      role: 'system',
      kind: 'message',
      labelKey: 'byok_block_system',
      fixedTokens: 'Be terse.'.length,
    });
    expect(blocks[3]!.role).toBe('user');
    // fixedTokens (not raw text) so the inspector never falls back to len/4.
    expect(blocks.every((b) => !('text' in b) && typeof b.fixedTokens === 'number')).toBe(true);
  });
});

describe('estimateCost', () => {
  it('prices input and output tokens per MTok', () => {
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, { inPerMTok: 3, outPerMTok: 15 })).toBe(
      3 + 7.5,
    );
    expect(estimateCost({}, { inPerMTok: 3, outPerMTok: 15 })).toBe(0);
  });
});

describe('redactedHeaders', () => {
  it('masks credential headers but keeps the rest', () => {
    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${KEY}`,
      'x-api-key': KEY,
    };
    const redacted = redactedHeaders(headers);
    expect(redacted['content-type']).toBe('application/json');
    expect(redacted.authorization).toBe('Bearer sk-••••••••');
    expect(redacted['x-api-key']).toBe('sk-••••••••');
    expect(JSON.stringify(redacted)).not.toContain(KEY);
  });
});

describe('stored byok key custody', () => {
  const stored = new Map<string, string>();

  beforeEach(() => {
    stored.clear();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('round-trips a config through ta:byok', () => {
    saveStoredByok({ version: 1, provider: 'anthropic', model: 'claude-test', apiKey: KEY });
    expect(loadStoredByok()).toEqual({
      version: 1,
      provider: 'anthropic',
      model: 'claude-test',
      apiKey: KEY,
    });
    clearStoredByok();
    expect(loadStoredByok()).toBeNull();
  });

  it('keeps the optional baseUrl only when present and non-empty', () => {
    saveStoredByok({
      version: 1,
      provider: 'custom',
      model: 'local',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: KEY,
    });
    expect(loadStoredByok()?.baseUrl).toBe('http://localhost:1234/v1');
  });

  it('returns null for malformed or foreign payloads', () => {
    stored.set(BYOK_STORAGE_KEY, 'not json');
    expect(loadStoredByok()).toBeNull();
    stored.set(BYOK_STORAGE_KEY, JSON.stringify({ version: 2, provider: 'openai', model: 'x', apiKey: 'y' }));
    expect(loadStoredByok()).toBeNull();
    stored.set(BYOK_STORAGE_KEY, JSON.stringify({ version: 1, provider: 'evil', model: 'x', apiKey: 'y' }));
    expect(loadStoredByok()).toBeNull();
    stored.set(BYOK_STORAGE_KEY, JSON.stringify({ version: 1, provider: 'openai', model: 'x', apiKey: '' }));
    expect(loadStoredByok()).toBeNull();
  });
});

describe('progress export never carries the API key', () => {
  beforeEach(() => {
    useTestStorageEngine();
    resetProgress();
  });

  afterEach(() => {
    cleanTestStorage();
  });

  it('exports progress fields only — no byok, no key material', () => {
    completeLevel('L10.1', 175);
    const exported = exportProgress();
    expect(exported).toContain('L10.1');
    expect(exported).not.toContain('byok');
    expect(exported).not.toContain('apiKey');
    expect(exported).not.toContain(KEY);
  });
});

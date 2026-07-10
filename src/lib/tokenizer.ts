export const ENCODINGS = ['o200k_base', 'cl100k_base', 'o200k_harmony'] as const;

export type EncodingId = (typeof ENCODINGS)[number];

export interface TokenPiece {
  token: number;
  /** Decoded text for this token. Empty string when a multi-byte character
      spans token boundaries and this token carries only partial bytes. */
  text: string;
}

export interface Tokenizer {
  encoding: EncodingId;
  encode(text: string): number[];
  countTokens(text: string): number;
  /** Token/text pairs aligned 1:1 with encode(); joining all texts yields the input. */
  pieces(text: string): TokenPiece[];
  vocabularySize: number;
}

interface EncodingModule {
  encode(text: string): number[];
  countTokens(input: string): number;
  decodeGenerator(tokens: Iterable<number>): Generator<string, void, void>;
  vocabularySize: number;
}

// Explicit literal imports so Vite can code-split one lazy chunk per encoding
// (each encoding ships megabytes of BPE ranks — never bundle them eagerly).
const loaders: Record<EncodingId, () => Promise<EncodingModule>> = {
  o200k_base: () => import('gpt-tokenizer/encoding/o200k_base'),
  cl100k_base: () => import('gpt-tokenizer/encoding/cl100k_base'),
  o200k_harmony: () => import('gpt-tokenizer/encoding/o200k_harmony'),
};

const cache = new Map<EncodingId, Promise<Tokenizer>>();

export function loadTokenizer(encoding: EncodingId): Promise<Tokenizer> {
  let loading = cache.get(encoding);
  if (!loading) {
    loading = loaders[encoding]().then((mod) => makeTokenizer(encoding, mod));
    cache.set(encoding, loading);
  }
  return loading;
}

function makeTokenizer(encoding: EncodingId, mod: EncodingModule): Tokenizer {
  return {
    encoding,
    encode: (text) => mod.encode(text),
    countTokens: (text) => mod.countTokens(text),
    pieces(text) {
      const tokens = mod.encode(text);
      const chunks: string[] = [];
      for (const chunk of mod.decodeGenerator(tokens)) {
        chunks.push(chunk);
      }
      return tokens.map((token, i) => ({ token, text: chunks[i] ?? '' }));
    },
    vocabularySize: mod.vocabularySize,
  };
}

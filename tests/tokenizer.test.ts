import { describe, expect, it } from 'vitest';
import { countTokens as countO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { countTokens as countCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
import { loadTokenizer } from '@/lib/tokenizer';

describe('loadTokenizer', () => {
  it('counts tokens identically to the underlying encoding', async () => {
    const tokenizer = await loadTokenizer('o200k_base');
    for (const sample of ['Hello world', 'Şu gülüşün 🚀 var ya', 'const x = () => 42;']) {
      expect(tokenizer.countTokens(sample)).toBe(countO200k(sample));
      expect(tokenizer.encode(sample).length).toBe(countO200k(sample));
    }
  });

  it('returns one piece per token whose texts join back to the input', async () => {
    const tokenizer = await loadTokenizer('o200k_base');
    for (const sample of ['Hello world', 'Şu gülüşün 🚀 var ya', 'çğıöşü İIıi', '🇹🇷🚀']) {
      const pieces = tokenizer.pieces(sample);
      expect(pieces.length).toBe(tokenizer.countTokens(sample));
      expect(pieces.map((p) => p.text).join('')).toBe(sample);
    }
  });

  it('caches tokenizers per encoding', async () => {
    const [a, b] = await Promise.all([loadTokenizer('cl100k_base'), loadTokenizer('cl100k_base')]);
    expect(a).toBe(b);
  });

  it('loads distinct encodings that count differently on non-English text', async () => {
    const turkish = 'Güneşli günlerde çayı şekersiz içerim.';
    const o200k = await loadTokenizer('o200k_base');
    const cl100k = await loadTokenizer('cl100k_base');
    expect(o200k.countTokens(turkish)).toBe(countO200k(turkish));
    expect(cl100k.countTokens(turkish)).toBe(countCl100k(turkish));
    // The curriculum fact behind L1.2: the newer, larger vocabulary is more
    // efficient on Turkish than the older one.
    expect(o200k.countTokens(turkish)).toBeLessThan(cl100k.countTokens(turkish));
  });
});

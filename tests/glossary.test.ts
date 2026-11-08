import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLOSSARY_TERMS } from '@/lib/glossary';

const MESSAGES_DIR = join(__dirname, '..', 'messages');
const catalogs = readdirSync(MESSAGES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    locale: file.replace('.json', ''),
    messages: JSON.parse(readFileSync(join(MESSAGES_DIR, file), 'utf8')) as Record<string, string>,
  }));

describe('glossary', () => {
  it('has a unique id per term', () => {
    expect(new Set(GLOSSARY_TERMS).size).toBe(GLOSSARY_TERMS.length);
  });

  it('defines every term in every catalog', () => {
    for (const { locale, messages } of catalogs) {
      for (const term of GLOSSARY_TERMS) {
        expect(messages[`glossary_${term}_term`], `${locale}: ${term} term`).toBeTruthy();
        expect(messages[`glossary_${term}_def`], `${locale}: ${term} def`).toBeTruthy();
      }
    }
  });
});

describe('lesson prose', () => {
  // Displayed lesson numbers derive from map position and move when modules
  // do; an internal id like "L2.2" in prose would silently point at the wrong
  // lesson. Refer to lessons by topic instead.
  it('never cites internal lesson ids', () => {
    const offenders = catalogs.flatMap(({ locale, messages }) =>
      Object.entries(messages)
        .filter(([, text]) => /\b[LM]\d+(\.\d+)?\b/.test(text))
        .map(([key, text]) => `${locale}:${key}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });
});

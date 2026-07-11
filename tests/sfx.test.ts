import { describe, expect, it } from 'vitest';
import { BEAT_EFFECTS, RECIPES, shouldPlay, type SfxEffect } from '@/engine/sfx';

/** Every beat kind any scene enqueues — keep in sync when adding beats. */
const SCENE_BEAT_KINDS = [
  'strain',
  'rupture',
  'beam-sweep',
  'verdict',
  'collect',
  'wrap',
  'ship',
  'reply',
  'pulse',
  'stamp',
  'scan',
  'press',
  'arm',
  'snapback',
  'file-fly',
];

describe('sfx gating', () => {
  it('plays only when enabled AND the delivery is animated', () => {
    expect(shouldPlay(true, false)).toBe(true);
    expect(shouldPlay(true, true)).toBe(false); // flush/skip/reduced = silent
    expect(shouldPlay(false, false)).toBe(false); // default off
    expect(shouldPlay(false, true)).toBe(false);
  });
});

describe('sfx recipe table', () => {
  it('maps every scene beat kind to an effect with a recipe', () => {
    for (const kind of SCENE_BEAT_KINDS) {
      const effect = BEAT_EFFECTS[kind];
      expect(effect, `beat kind "${kind}" has no effect mapping`).toBeDefined();
      expect(RECIPES[effect!], `effect "${effect}" has no recipe`).toBeDefined();
    }
  });

  it('keeps every recipe tiny and sane', () => {
    for (const [name, recipe] of Object.entries(RECIPES) as [SfxEffect, (typeof RECIPES)[SfxEffect]][]) {
      const steps = [...(recipe.tones ?? []), ...(recipe.noise ?? [])];
      expect(steps.length, `${name} is empty`).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.duration).toBeGreaterThan(0);
        expect(step.duration).toBeLessThanOrEqual(0.5); // clicks and thuds, not music
        expect(step.gain).toBeGreaterThan(0);
        expect(step.gain).toBeLessThanOrEqual(0.5);
      }
    }
  });
});

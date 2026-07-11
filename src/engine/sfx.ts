/**
 * Synthesized sound effects (spec §6.2) — Web Audio only, zero asset files.
 * Default OFF; the caller gates on settings.sfx and delivery mode
 * (shouldPlay), so sounds are silenced by flush/skip/reduced motion by
 * construction and never outlive their animation.
 *
 * The recipe table and gating logic are pure and unit-tested; only
 * playEffect touches the AudioContext.
 */

export type SfxEffect = 'thud' | 'pop' | 'rip' | 'whoosh' | 'stamp' | 'chime' | 'alarm';

/** Every animation-beat kind a scene enqueues maps to one effect. */
export const BEAT_EFFECTS: Record<string, SfxEffect> = {
  // container
  strain: 'alarm',
  rupture: 'rip',
  // corridor
  'beam-sweep': 'whoosh',
  verdict: 'pop',
  // conveyor
  collect: 'pop',
  wrap: 'stamp',
  ship: 'whoosh',
  reply: 'pop',
  // tower / routing
  pulse: 'whoosh',
  stamp: 'stamp',
  scan: 'whoosh',
  // compactor / assembly / jenga / config
  press: 'stamp',
  arm: 'whoosh',
  snapback: 'thud',
  'file-fly': 'whoosh',
};

export function shouldPlay(sfxEnabled: boolean, instantDelivery: boolean): boolean {
  return sfxEnabled && !instantDelivery;
}

interface ToneStep {
  /** start frequency (Hz); glides to endFreq when set */
  freq: number;
  endFreq?: number;
  type: OscillatorType;
  duration: number;
  gain: number;
  delay?: number;
}

interface NoiseStep {
  duration: number;
  gain: number;
  /** band-pass center; omit for raw noise */
  bandHz?: number;
  delay?: number;
}

export interface SfxRecipe {
  tones?: ToneStep[];
  noise?: NoiseStep[];
}

export const RECIPES: Record<SfxEffect, SfxRecipe> = {
  thud: {
    tones: [{ freq: 90, endFreq: 55, type: 'sine', duration: 0.12, gain: 0.5 }],
    noise: [{ duration: 0.03, gain: 0.18 }],
  },
  pop: {
    tones: [{ freq: 600, endFreq: 900, type: 'square', duration: 0.06, gain: 0.12 }],
  },
  rip: {
    noise: [{ duration: 0.35, gain: 0.3, bandHz: 1200 }],
    tones: [{ freq: 420, endFreq: 70, type: 'sawtooth', duration: 0.35, gain: 0.16 }],
  },
  whoosh: {
    noise: [{ duration: 0.3, gain: 0.16, bandHz: 800 }],
  },
  stamp: {
    tones: [{ freq: 200, endFreq: 160, type: 'sine', duration: 0.09, gain: 0.4 }],
    noise: [{ duration: 0.015, gain: 0.2 }],
  },
  chime: {
    tones: [
      { freq: 659, type: 'sine', duration: 0.16, gain: 0.18 },
      { freq: 988, type: 'sine', duration: 0.22, gain: 0.16, delay: 0.09 },
    ],
  },
  alarm: {
    tones: [
      { freq: 220, type: 'square', duration: 0.09, gain: 0.1 },
      { freq: 227, type: 'square', duration: 0.09, gain: 0.1 },
      { freq: 220, type: 'square', duration: 0.09, gain: 0.1, delay: 0.14 },
      { freq: 227, type: 'square', duration: 0.09, gain: 0.1, delay: 0.14 },
    ],
  },
};

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

export function playEffect(effect: SfxEffect): void {
  const recipe = RECIPES[effect];
  const ctx = getContext();
  if (!ctx || !recipe) return;
  const now = ctx.currentTime;

  for (const tone of recipe.tones ?? []) {
    const start = now + (tone.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(tone.endFreq, 1), start + tone.duration);
    }
    gain.gain.setValueAtTime(tone.gain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }

  for (const noise of recipe.noise ?? []) {
    const start = now + (noise.delay ?? 0);
    const frames = Math.ceil(ctx.sampleRate * noise.duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // presentation-only randomness — never gameplay-relevant
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(noise.gain, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + noise.duration);
    let node: AudioNode = source;
    if (noise.bandHz) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = noise.bandHz;
      node.connect(filter);
      node = filter;
    }
    node.connect(gain).connect(ctx.destination);
    source.start(start);
  }
}
